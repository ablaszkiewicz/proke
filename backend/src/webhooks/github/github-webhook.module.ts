import { Module } from '@nestjs/common';
import { InstallationWriteModule } from '../../installations/write/installation-write.module';
import { NotificationsCoreModule } from '../../notifications/core/notifications-core.module';
import { SubscriptionReadModule } from '../../subscriptions/read/subscription-read.module';
import { SubscriptionWriteModule } from '../../subscriptions/write/subscription-write.module';
import { UserReadModule } from '../../user/read/user-read.module';
import { GithubWebhookInstallationsService } from './github-webhook-installations.service';
import { GithubWebhookRouterService } from './github-webhook-router.service';
import { GithubWebhookSignatureService } from './github-webhook-signature.service';
import { GithubWebhookController } from './github-webhook.controller';

@Module({
  imports: [
    UserReadModule,
    InstallationWriteModule,
    NotificationsCoreModule,
    SubscriptionReadModule,
    SubscriptionWriteModule,
  ],
  controllers: [GithubWebhookController],
  providers: [
    GithubWebhookSignatureService,
    GithubWebhookInstallationsService,
    GithubWebhookRouterService,
  ],
})
export class GithubWebhookModule {}
