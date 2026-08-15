import { Injectable, Logger } from '@nestjs/common';
import { InstallationSerializer } from '../../installations/core/entities/installation.serializer';
import { InstallationWriteService } from '../../installations/write/installation-write.service';
import { SubscriptionWriteService } from '../../subscriptions/write/subscription-write.service';

/**
 * Keeps the local installation mirror in step with GitHub. Everything here is driven by
 * webhooks, so the connections page never has to fan out one API call per org.
 */
@Injectable()
export class GithubWebhookInstallationsService {
  private readonly logger = new Logger(GithubWebhookInstallationsService.name);

  constructor(
    private readonly installationWriteService: InstallationWriteService,
    private readonly subscriptionWriteService: SubscriptionWriteService,
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
      return;
    }

    await this.installationWriteService.upsert(InstallationSerializer.fromGithubPayload(installation));
    this.logger.log(
      `Installation ${payload.action} for ${installation.account?.login} ` +
        `(${installation.repository_selection})`,
    );
  }
}
