import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsEvent } from '../../analytics/analytics-events';
import { AnalyticsService } from '../../analytics/analytics.service';
import { InstallationSerializer } from '../../installations/core/entities/installation.serializer';
import { InstallationWriteService } from '../../installations/write/installation-write.service';
import { SubscriptionWriteService } from '../../subscriptions/write/subscription-write.service';
import { UserReadService } from '../../user/read/user-read.service';

/**
 * Keeps the local installation mirror in step with GitHub.
 *
 * The connections page still asks GitHub which installations a given user may see - only GitHub
 * knows that - but it reads what proke knows about each one from here, so every member of an org
 * sees the same state and sees it as soon as the webhook lands rather than whenever someone's
 * token last managed a round trip.
 */
@Injectable()
export class GithubWebhookInstallationsService {
  private readonly logger = new Logger(GithubWebhookInstallationsService.name);

  constructor(
    private readonly installationWriteService: InstallationWriteService,
    private readonly subscriptionWriteService: SubscriptionWriteService,
    private readonly userReadService: UserReadService,
    private readonly analytics: AnalyticsService,
  ) {}

  public async handle(event: string, payload: any): Promise<void> {
    const installation = payload?.installation;

    if (!installation) {
      return;
    }

    // `deleted` is the app being uninstalled outright. Suspension is not deletion: the row
    // stays so the UI can say "suspended" rather than "never connected".
    if (event === 'installation' && payload.action === 'deleted') {
      await this.installationWriteService.delete(String(installation.id));
      // Opt-ins die with the installation, so a reinstall cannot resurrect consent.
      await this.subscriptionWriteService.deleteByInstallation(String(installation.id));
      this.logger.log(`Installation removed for ${installation.account?.login}`);

      await this.record('org_removed', payload, installation);
      return;
    }

    await this.installationWriteService.upsert(
      InstallationSerializer.fromGithubPayload(installation),
    );
    this.logger.log(
      `Installation ${payload.action} for ${installation.account?.login} ` +
        `(${installation.repository_selection})`,
    );

    // `installation_repositories` and a suspension both land here as an upsert. Only a genuine
    // new installation is the confirmation the frontend's install click was waiting for -
    // counting a repository-list edit as one would inflate the number that matters most.
    if (event === 'installation' && payload.action === 'created') {
      await this.record('org_installed', payload, installation);
    }
  }

  /**
   * The server's half of "connect an org", captured against whoever pressed the button.
   *
   * This is the only confirmation that exists: installing happens on github.com, so the
   * frontend never sees the outcome and there is no request to hang it off. GitHub does name
   * the actor in `sender`, which is enough to resolve them to a proke user - and usually is
   * one, because installing is something you do from the dashboard.
   *
   * When it is not one, the event still counts but creates no person. We receive events for
   * whole organisations, most of whose members have never heard of proke, and a person profile
   * for each of them would be a directory of non-users.
   */
  private async record(event: AnalyticsEvent, payload: any, installation: any): Promise<void> {
    const properties = {
      installation_id: String(installation.id),
      account_login: installation.account?.login,
      account_type: installation.account?.type,
      repository_selection: installation.repository_selection,
    };

    const senderGithubId = payload?.sender?.id ? String(payload.sender.id) : undefined;
    const user = senderGithubId ? await this.userReadService.readByGithubId(senderGithubId) : null;

    if (user) {
      this.analytics.capture(user.id, event, properties);
      return;
    }

    this.analytics.captureWithoutPerson(`github:${senderGithubId ?? installation.id}`, event, {
      ...properties,
      sender_login: payload?.sender?.login,
    });
  }
}
