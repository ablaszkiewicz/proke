import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AnalyticsEvent } from '../analytics/analytics-events';
import { AnalyticsService } from '../analytics/analytics.service';
import { GithubAppInstallationsService } from '../github-app/github-app-installations.service';
import { InstallationNormalized } from '../installations/core/entities/installation.interface';
import { InstallationReadService } from '../installations/read/installation-read.service';
import { InstallationWriteService } from '../installations/write/installation-write.service';
import { getEnvConfig } from '../shared/configs/env-configs';
import { GithubOrgMembershipDataService } from './github-org-membership-data.service';
import { NotificationPreferencesNormalized } from '../subscriptions/core/entities/subscription.interface';
import { SubscriptionReadService } from '../subscriptions/read/subscription-read.service';
import { SubscriptionWriteService } from '../subscriptions/write/subscription-write.service';
import { UserNormalized } from '../user/core/entities/user.interface';
import { UserReadService } from '../user/read/user-read.service';
import { UserWriteService } from '../user/write/user-write.service';
import {
  AccessibleRepositoryResponse,
  ConnectionStatus,
  ConnectionsResponse,
  ViewerRole,
} from './dto/connection.response';
import { UpdateNotificationPreferencesBody } from './dto/update-notification-preferences.body';
import {
  GithubTokenRejectedError,
  GithubUserInstallationsDataService,
} from './github-user-installations-data.service';
import { GithubUserRepositoriesDataService } from './github-user-repositories-data.service';
import { ownsPersonalAccount } from './installation-ownership';

/**
 * What one installation looks like from where a particular user stands, as opposed to what it
 * is. Every field is optional because every field costs a GitHub call that can fail, and a row
 * with a missing label is a much better outcome than a page that will not load.
 */
interface ViewerAccess {
  viewerRole?: ViewerRole;
  repositoryCount?: number;
  repositories?: AccessibleRepositoryResponse[];
}

// Installations looked up at a time. Each one costs up to two GitHub calls, and GitHub's
// secondary rate limit counts concurrency rather than volume.
const ACCESS_LOOKUP_BATCH = 8;

/**
 * A 403 that also says, in one word, why - so it can be counted.
 *
 * Every refusal in here is an ordinary ForbiddenException to the caller and reads identically
 * to the browser. The reason code exists only so the analytics event can tell them apart
 * without matching on a human-readable message, which would break the moment somebody improves
 * the wording.
 */
class ConnectionRefusal extends ForbiddenException {
  constructor(
    message: string,
    public readonly reason: string,
  ) {
    super(message);
  }
}

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly userReadService: UserReadService,
    private readonly userWriteService: UserWriteService,
    private readonly installationsDataService: GithubUserInstallationsDataService,
    private readonly repositoriesDataService: GithubUserRepositoriesDataService,
    private readonly subscriptionReadService: SubscriptionReadService,
    private readonly subscriptionWriteService: SubscriptionWriteService,
    private readonly orgMembershipDataService: GithubOrgMembershipDataService,
    private readonly appInstallationsService: GithubAppInstallationsService,
    private readonly installationReadService: InstallationReadService,
    private readonly installationWriteService: InstallationWriteService,
    private readonly analytics: AnalyticsService,
  ) {}

  public async readForUser(userId: string): Promise<ConnectionsResponse> {
    const user = await this.userReadService.readByIdOrThrow(userId);

    if (!user.githubAccessToken) {
      return { connections: [], installUrl: buildInstallUrl(), githubReauthRequired: true };
    }

    let installations: InstallationNormalized[];

    try {
      installations = await this.installationsDataService.listForUser(user.githubAccessToken);
    } catch (error) {
      if (!(error instanceof GithubTokenRejectedError)) {
        throw error;
      }

      // A dead GitHub token is not a dead proke session, and answering 401 here is what made the
      // dashboard sign the user out. Drop the token so it is not presented again on every load,
      // and hand back an empty page that says what actually needs fixing.
      this.logger.warn(`GitHub rejected the stored token for user ${userId}; clearing it`);
      await this.userWriteService.clearGithubAccessToken(userId);

      return { connections: [], installUrl: buildInstallUrl(), githubReauthRequired: true };
    }

    const [subscriptions, mirrored] = await Promise.all([
      this.subscriptionReadService.readForUser(userId),
      this.installationReadService.readByInstallationIds(
        installations.map((installation) => installation.installationId),
      ),
    ]);

    const preferencesByInstallation = new Map(
      subscriptions.map((subscription) => [subscription.installationId, subscription.preferences]),
    );

    await this.backfillMirror(installations, mirrored);

    // GitHub said which installations this user may see; the mirror says what proke knows about
    // each one. The mirror wins where it has a row, so every member of an org reads the same
    // state, kept current by the installation webhooks. The live payload is the fallback for
    // anything installed before those webhooks were wired up.
    const resolved = installations.map((live) => mirrored.get(live.installationId) ?? live);

    const access = await this.readViewerAccess(user, resolved);

    return {
      connections: resolved.map((installation) => {
        const preferences = preferencesByInstallation.get(installation.installationId);

        return {
          installationId: installation.installationId,
          accountLogin: installation.accountLogin,
          accountType: installation.accountType,
          status: installation.suspendedAt
            ? ConnectionStatus.Suspended
            : preferences
              ? ConnectionStatus.Subscribed
              : ConnectionStatus.Available,
          repositorySelection: installation.repositorySelection,
          ...access.get(installation.installationId),
          manageUrl: buildManageUrl(installation),
          preferences,
        };
      }),
      installUrl: buildInstallUrl(),
    };
  }

  /**
   * What each installation looks like from where this user stands: which repositories they
   * reach through it, and what they are to the account it sits on.
   *
   * Both have to be asked of GitHub with the user's own token, because both are properties of
   * the person rather than of the installation - `repository_selection` says "all" to somebody
   * who was shared exactly one repository, and an org owner and a contractor read the same row.
   *
   * The calls are independent, so they go out in parallel - but in bounded batches rather than
   * all at once, because GitHub's secondary rate limit is about concurrency and somebody in a
   * hundred installations would otherwise open two hundred sockets on one page load.
   *
   * Every call is allowed to fail on its own: a row that loses its repository count still
   * renders, still toggles, and still says what the installation covers. None of this gates
   * anything.
   */
  private async readViewerAccess(
    user: UserNormalized,
    installations: InstallationNormalized[],
  ): Promise<Map<string, ViewerAccess>> {
    const access = new Map<string, ViewerAccess>();

    for (let start = 0; start < installations.length; start += ACCESS_LOOKUP_BATCH) {
      const batch = installations.slice(start, start + ACCESS_LOOKUP_BATCH);

      const entries = await Promise.all(
        batch.map(
          async (installation) =>
            [
              installation.installationId,
              await this.readViewerAccessFor(user, installation),
            ] as const,
        ),
      );

      for (const [installationId, viewerAccess] of entries) {
        access.set(installationId, viewerAccess);
      }
    }

    return access;
  }

  private async readViewerAccessFor(
    user: UserNormalized,
    installation: InstallationNormalized,
  ): Promise<ViewerAccess> {
    try {
      const [accessible, viewerRole] = await Promise.all([
        this.repositoriesDataService.listForInstallation(
          user.githubAccessToken!,
          installation.installationId,
        ),
        this.readViewerRole(user, installation),
      ]);

      return {
        viewerRole,
        repositoryCount: accessible?.totalCount,
        repositories: accessible?.repositories,
      };
    } catch (error) {
      this.logger.warn(
        `Could not read this user's access to installation ${installation.installationId}: ${error}`,
      );

      return {};
    }
  }

  private async readViewerRole(
    user: UserNormalized,
    installation: InstallationNormalized,
  ): Promise<ViewerRole | undefined> {
    if (installation.accountType !== 'Organization') {
      // A personal installation has exactly one owner - the account it sits on. Anybody else
      // seeing it was granted a repository inside it, which is a membership by any other name.
      return ownsPersonalAccount(user, installation) ? ViewerRole.Owner : ViewerRole.Member;
    }

    const role = await this.orgMembershipDataService.readRole(
      user.githubAccessToken!,
      installation.accountLogin,
    );

    // null is "could not establish" - a missing Members permission, a suspended membership.
    // Undefined leaves the label off the row rather than guessing at somebody's standing, and
    // is the only honest answer; the uninstall gate reads the same null as a refusal.
    if (role === null) {
      return undefined;
    }

    return role === 'admin' ? ViewerRole.Owner : ViewerRole.Member;
  }

  /**
   * Writes mirror rows for installations that have none.
   *
   * The mirror is fed by webhooks, so it only knows about installations created since the app's
   * webhook was configured. Backfilling on read makes it self-healing rather than permanently
   * blind to anything older, and costs nothing once every installation is present.
   */
  private async backfillMirror(
    live: InstallationNormalized[],
    mirrored: Map<string, InstallationNormalized>,
  ): Promise<void> {
    const missing = live.filter((installation) => !mirrored.has(installation.installationId));

    if (missing.length === 0) {
      return;
    }

    await Promise.all(
      missing.map((installation) => this.installationWriteService.upsert(installation)),
    );
  }

  public async subscribe(userId: string, installationId: string): Promise<void> {
    let installation: InstallationNormalized;

    try {
      installation = await this.assertUserCanAccessInstallation(userId, installationId);
    } catch (error) {
      this.captureFailure(userId, 'org_subscribe_failed', installationId, error);
      throw error;
    }

    await this.subscriptionWriteService.create(userId, installationId);

    this.analytics.capture(userId, 'org_subscribed', {
      installation_id: installationId,
      account_login: installation.accountLogin,
      account_type: installation.accountType,
      repository_selection: installation.repositorySelection,
    });
  }

  /**
   * Which repositories and which kinds of event this user wants out of an installation.
   *
   * No GitHub round-trip: the subscription already proves the access check passed when it was
   * created, and this only ever narrows what somebody receives.
   */
  public async updatePreferences(
    userId: string,
    installationId: string,
    body: UpdateNotificationPreferencesBody,
  ): Promise<NotificationPreferencesNormalized> {
    const preferences: NotificationPreferencesNormalized = {
      repositoryScope: body.repositoryScope,
      notificationTypes: unique(body.notificationTypes),
      repositories: dedupeByRepositoryId(body.repositories ?? []).map((repository) => ({
        repositoryId: repository.repositoryId,
        repositoryFullName: repository.repositoryFullName,
        enabled: repository.enabled,
        notificationTypes: repository.notificationTypes
          ? unique(repository.notificationTypes)
          : undefined,
      })),
    };

    const updated = await this.subscriptionWriteService.updatePreferences(
      userId,
      installationId,
      preferences,
    );

    if (!updated) {
      throw new NotFoundException(
        'Turn this account on before choosing what it notifies you about',
      );
    }

    return preferences;
  }

  public async unsubscribe(userId: string, installationId: string): Promise<void> {
    // No access check: letting someone stop being poked is never the risky direction.
    await this.subscriptionWriteService.delete(userId, installationId);

    // Only the id. Every other path here has the installation in hand already; this one would
    // have to fetch it, and a database read whose only purpose is to make an analytics event
    // prettier is not worth doing on a write path. The id joins to org_subscribed, which
    // carries the account name.
    this.analytics.capture(userId, 'org_unsubscribed', { installation_id: installationId });
  }

  /**
   * Removes the app from an account for *everyone*, not just the caller. Unsubscribing is the
   * per-user action; this is the org-wide one, so it is gated on actually being an owner.
   */
  public async uninstall(userId: string, installationId: string): Promise<void> {
    let installation: InstallationNormalized | undefined;

    try {
      installation = await this.performUninstall(userId, installationId);
    } catch (error) {
      this.captureFailure(userId, 'org_uninstall_failed', installationId, error);
      throw error;
    }

    this.analytics.capture(userId, 'org_uninstalled', {
      installation_id: installationId,
      account_login: installation.accountLogin,
      account_type: installation.accountType,
    });
  }

  private async performUninstall(
    userId: string,
    installationId: string,
  ): Promise<InstallationNormalized> {
    const user = await this.userReadService.readByIdOrThrow(userId);

    if (!user.githubAccessToken) {
      throw new ConnectionRefusal('No GitHub token on file for this user', 'no_github_token');
    }

    const installation = (await this.listForUserOrExplain(userId, user.githubAccessToken)).find(
      (i) => i.installationId === installationId,
    );

    if (!installation) {
      throw new ConnectionRefusal('You do not have access to that installation', 'no_access');
    }

    await this.assertUserMayUninstall(user, installation);

    await this.appInstallationsService.uninstall(installationId);

    // GitHub will also send an `installation.deleted` webhook, which does the same thing.
    // Doing it here too means the next page load is correct even if that is slow or lost.
    await this.installationWriteService.delete(installationId);
    await this.subscriptionWriteService.deleteByInstallation(installationId);

    return installation;
  }

  /**
   * A refusal, recorded rather than only thrown.
   *
   * The reason is the whole value of the event: "someone tried to remove proke from an org they
   * do not own" and "someone's GitHub authorization has died" are the same 403 to the browser
   * and completely different things to know about.
   */
  private captureFailure(
    userId: string,
    event: AnalyticsEvent,
    installationId: string,
    error: unknown,
  ): void {
    this.analytics.capture(userId, event, {
      installation_id: installationId,
      reason: error instanceof ConnectionRefusal ? error.reason : 'unexpected',
    });
  }

  /**
   * `GET /user/installations` proves the user can *see* an installation - every member of the
   * org can. It says nothing about whether they may remove it, and calling GitHub's uninstall
   * endpoint as the app skips GitHub's own permission check entirely. So we do it here, or one
   * disgruntled member takes the whole org's notifications down.
   */
  private async assertUserMayUninstall(
    user: UserNormalized,
    installation: InstallationNormalized,
  ): Promise<void> {
    if (installation.accountType !== 'Organization') {
      // A personal installation belongs to exactly one person. The same test decides whether a
      // row is labelled owner or member, and the two must never disagree.
      if (!ownsPersonalAccount(user, installation)) {
        throw new ConnectionRefusal('That installation is not on your account', 'not_your_account');
      }

      return;
    }

    const role = await this.orgMembershipDataService.readRole(
      user.githubAccessToken!,
      installation.accountLogin,
    );

    // null means we could not establish the role - missing permission, suspended membership.
    // Treat anything short of a confirmed admin as a refusal.
    if (role !== 'admin') {
      throw new ConnectionRefusal(
        `Only an owner of ${installation.accountLogin} can remove proke from it.`,
        'not_owner',
      );
    }
  }

  /**
   * Without this, anyone could POST an arbitrary installation id and start receiving another
   * organisation's pull request activity. The check has to be against GitHub rather than our
   * own mirror, because only GitHub knows whether *this* user is in that org.
   */
  private async assertUserCanAccessInstallation(
    userId: string,
    installationId: string,
  ): Promise<InstallationNormalized> {
    const user = await this.userReadService.readByIdOrThrow(userId);

    if (!user.githubAccessToken) {
      throw new ConnectionRefusal('No GitHub token on file for this user', 'no_github_token');
    }

    const installations = await this.listForUserOrExplain(userId, user.githubAccessToken);

    // Returned rather than merely asserted: the caller has to name the account in its event,
    // and this already holds the only copy of it that GitHub has confirmed for this user.
    const installation = installations.find((i) => i.installationId === installationId);

    if (!installation) {
      throw new ConnectionRefusal('You do not have access to that installation', 'no_access');
    }

    return installation;
  }

  /**
   * `listForUser`, with a dead GitHub token turned into an answer the user can act on.
   *
   * The mutating paths cannot degrade to an empty page the way `readForUser` does - refusing is
   * the only safe outcome when the access check itself could not run - but they must still not
   * answer 401, which the dashboard reads as "your proke session expired" and acts on by
   * signing the user out.
   */
  private async listForUserOrExplain(
    userId: string,
    accessToken: string,
  ): Promise<InstallationNormalized[]> {
    try {
      return await this.installationsDataService.listForUser(accessToken);
    } catch (error) {
      if (!(error instanceof GithubTokenRejectedError)) {
        throw error;
      }

      this.logger.warn(`GitHub rejected the stored token for user ${userId}; clearing it`);
      await this.userWriteService.clearGithubAccessToken(userId);

      throw new ConnectionRefusal(
        'GitHub no longer accepts your authorization. Sign in with GitHub again to reconnect.',
        'github_token_rejected',
      );
    }
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

// Two entries for one repository would make the router's `find` order-dependent. Last wins,
// which is what a form that submits a row twice means.
function dedupeByRepositoryId<T extends { repositoryId: string }>(values: T[]): T[] {
  return [...new Map(values.map((value) => [value.repositoryId, value])).values()];
}

export function buildInstallUrl(): string {
  const { slug } = getEnvConfig().githubApp;

  return `https://github.com/apps/${slug}/installations/new`;
}

export function buildManageUrl(installation: {
  installationId: string;
  accountLogin: string;
  accountType: string;
}): string {
  const { installationId, accountLogin, accountType } = installation;

  // GitHub does not redirect between the two: the personal path 404s for an installation that
  // lives on an organization, even for the org's owner.
  return accountType === 'Organization'
    ? `https://github.com/organizations/${accountLogin}/settings/installations/${installationId}`
    : `https://github.com/settings/installations/${installationId}`;
}
