import { Module } from '@nestjs/common';
import { SlackAppModule } from '../../slack/app/slack-app.module';
import { SlackLinkReadModule } from '../../slack/links/read/slack-link-read.module';
import { SlackLinkWriteModule } from '../../slack/links/write/slack-link-write.module';
import { SlackWorkspaceReadModule } from '../../slack/workspaces/read/slack-workspace-read.module';
import { SlackWorkspaceWriteModule } from '../../slack/workspaces/write/slack-workspace-write.module';
import { NotificationDeliveryService } from '../delivery/notification-delivery.service';
import { ReviewBatchService } from '../delivery/review-batch.service';
import { SlackNotificationDeliveryService } from '../delivery/slack-notification-delivery.service';

@Module({
  imports: [
    SlackAppModule,
    SlackLinkReadModule,
    SlackLinkWriteModule,
    SlackWorkspaceReadModule,
    SlackWorkspaceWriteModule,
  ],
  providers: [NotificationDeliveryService, SlackNotificationDeliveryService, ReviewBatchService],
  exports: [NotificationDeliveryService, SlackNotificationDeliveryService, ReviewBatchService],
})
export class NotificationsCoreModule {}
