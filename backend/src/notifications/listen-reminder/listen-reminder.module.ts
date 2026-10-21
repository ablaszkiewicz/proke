import { Module } from '@nestjs/common';
import { SlackLinkReadModule } from '../../slack/links/read/slack-link-read.module';
import { SubscriptionReadModule } from '../../subscriptions/read/subscription-read.module';
import { UserReadModule } from '../../user/read/user-read.module';
import { UserWriteModule } from '../../user/write/user-write.module';
import { NotificationsCoreModule } from '../core/notifications-core.module';
import { ListenReminderService } from './listen-reminder.service';

/**
 * The timer that reminds people who listen to nothing, and what "Never remind me again" calls.
 * Above the delivery it uses, like DigestModule: delivery should not know about a schedule.
 */
@Module({
  imports: [
    SlackLinkReadModule,
    SubscriptionReadModule,
    UserReadModule,
    UserWriteModule,
    NotificationsCoreModule,
  ],
  providers: [ListenReminderService],
  exports: [ListenReminderService],
})
export class ListenReminderModule {}
