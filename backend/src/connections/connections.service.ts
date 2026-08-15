import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GithubAppInstallationsService } from '../github-app/github-app-installations.service';
import { InstallationNormalized } from '../installations/core/entities/installation.interface';
import { InstallationWriteService } from '../installations/write/installation-write.service';
import { getEnvConfig } from '../shared/configs/env-configs';
import { GithubOrgMembershipDataService } from './github-org-membership-data.service';
import { NotificationPreferencesNormalized } from '../subscriptions/core/entities/subscription.interface';
import { SubscriptionReadService } from '../subscriptions/read/subscription-read.service';
import { SubscriptionWriteService } from '../subscriptions/write/subscription-write.service';
import { UserReadService } from '../user/read/user-read.service';
import { ConnectionStatus, ConnectionsResponse } from './dto/connection.response';
import { UpdateNotificationPreferencesBody } from './dto/update-notification-preferences.body';
import { GithubUserInstallationsDataService } from './github-user-installations-data.service';

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly userReadService: UserReadService,
    private readonly installationsDataService: GithubUserInstallationsDataService,
    private readonly subscriptionReadService: SubscriptionReadService,
    private readonly subscriptionWriteService: SubscriptionWriteService,
    private readonly orgMembershipDataService: GithubOrgMembershipDataService,
    private readonly appInstallationsService: GithubAppInstallationsService,
    private readonly installationWriteService: InstallationWriteService,
  ) {}

  public async readForUser(userId: string): Promise<ConnectionsResponse> {
    const user = await this.userReadService.readByIdOrThrow(userId);

    if (!user.githubAccessToken) {
      return { connections: [], installUrl: buildInstallUrl() };
    }

    const installations = await this.installationsDataService.listForUser(user.githubAccessToken);
    const subscriptions = new Map(
      (await this.subscriptionReadService.readForUser(userId)).map((subscription) => [
        subscription.installationId,
        subscription.preferences,
      ]),
    );

    return {
      connections: installations.map((installation) => {
        const preferences = subscriptions.get(installation.installationId);

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
          manageUrl: buildManageUrl(installation.installationId),
          preferences,
        };
      }),
      installUrl: buildInstallUrl(),
    };
  }

  public async subscribe(userId: string, installationId: string): Promise<void> {
    await this.assertUserCanAccessInstallation(userId, installationId);

    await this.subscriptionWriteService.create(userId, installationId);
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
      throw new NotFoundException('Turn this account on before choosing what it notifies you about');
    }

    return preferences;
  }

  public async unsubscribe(userId: string, installationId: string): Promise<void> {
    // No access check: letting someone stop being poked is never the risky direction.
    await this.subscriptionWriteService.delete(userId, installationId);
  }

  /**
   * Removes the app from an account for *everyone*, not just the caller. Unsubscribing is the
   * per-user action; this is the org-wide one, so it is gated on actually being an owner.
   */
  public async uninstall(userId: string, installationId: string): Promise<void> {
    const user = await this.userReadService.readByIdOrThrow(userId);

    if (!user.githubAccessToken) {
      throw new ForbiddenException('No GitHub token on file for this user');
    }

    const installation = (
      await this.installationsDataService.listForUser(user.githubAccessToken)
    ).find((i) => i.installationId === installationId);

    if (!installation) {
      throw new ForbiddenException('You do not have access to that installation');
    }

    await this.assertUserMayUninstall(user.githubAccessToken, user.githubLogin, installation);

    await this.appInstallationsService.uninstall(installationId);

    // GitHub will also send an `installation.deleted` webhook, which does the same thing.
    // Doing it here too means the next page load is correct even if that is slow or lost.
    await this.installationWriteService.delete(installationId);
    await this.subscriptionWriteService.deleteByInstallation(installationId);
  }

  /**
   * `GET /user/installations` proves the user can *see* an installation - every member of the
   * org can. It says nothing about whether they may remove it, and calling GitHub's uninstall
   * endpoint as the app skips GitHub's own permission check entirely. So we do it here, or one
   * disgruntled member takes the whole org's notifications down.
   */
  private async assertUserMayUninstall(
    accessToken: string,
    githubLogin: string | undefined,
    installation: InstallationNormalized,
  ): Promise<void> {
    if (installation.accountType !== 'Organization') {
      // A personal installation belongs to exactly one person.
      if (!githubLogin || installation.accountLogin.toLowerCase() !== githubLogin.toLowerCase()) {
        throw new ForbiddenException('That installation is not on your account');
      }

      return;
    }

    const role = await this.orgMembershipDataService.readRole(
      accessToken,
      installation.accountLogin,
    );

    // null means we could not establish the role - missing permission, suspended membership.
    // Treat anything short of a confirmed admin as a refusal.
    if (role !== 'admin') {
      throw new ForbiddenException(
        `Only an owner of ${installation.accountLogin} can remove proke from it.`,
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
  ): Promise<void> {
    const user = await this.userReadService.readByIdOrThrow(userId);

    if (!user.githubAccessToken) {
      throw new ForbiddenException('No GitHub token on file for this user');
    }

    const installations = await this.installationsDataService.listForUser(user.githubAccessToken);

    if (!installations.some((i) => i.installationId === installationId)) {
      throw new ForbiddenException('You do not have access to that installation');
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

export function buildManageUrl(installationId: string): string {
  // Resolves to the right personal or org settings page on GitHub's side.
  return `https://github.com/settings/installations/${installationId}`;
}
