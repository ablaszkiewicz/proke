import { Module } from '@nestjs/common';
import { SlackAppModule } from '../../slack/app/slack-app.module';
import { SlackLinkReadModule } from '../../slack/links/read/slack-link-read.module';
import { SlackLinkWriteModule } from '../../slack/links/write/slack-link-write.module';
import { SlackWorkspaceReadModule } from '../../slack/workspaces/read/slack-workspace-read.module';
import { SlackWorkspaceWriteModule } from '../../slack/workspaces/write/slack-workspace-write.module';
import { NotificationDeliveryService } from '../delivery/notification-delivery.service';
import { PokeResolutionService } from '../delivery/poke-resolution.service';
import { ReviewBatchService } from '../delivery/review-batch.service';
import { SlackNotificationDeliveryService } from '../delivery/slack-notification-delivery.service';
import { PokeMessageReadModule } from '../messages/read/poke-message-read.module';
import { PokeMessageWriteModule } from '../messages/write/poke-message-write.module';

@Module({
  imports: [
    SlackAppModule,
    SlackLinkReadModule,
    SlackLinkWriteModule,
    SlackWorkspaceReadModule,
    SlackWorkspaceWriteModule,
    PokeMessageReadModule,
    PokeMessageWriteModule,
  ],
  providers: [
    NotificationDeliveryService,
    SlackNotificationDeliveryService,
    ReviewBatchService,
    PokeResolutionService,
  ],
  exports: [
    NotificationDeliveryService,
    SlackNotificationDeliveryService,
    ReviewBatchService,
    PokeResolutionService,
  ],
})
export class NotificationsCoreModule {}
