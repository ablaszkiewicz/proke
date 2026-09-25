import { Module } from '@nestjs/common';
import { SlackLinkReadModule } from '../../slack/links/read/slack-link-read.module';
import { NotificationsCoreModule } from '../core/notifications-core.module';
import { AnnouncementService } from './announcement.service';
import { AnnouncementStoreModule } from './store/announcement-store.module';

/**
 * The runner that sends announcements on start. Above the delivery it uses, like DigestModule:
 * delivery should not know that anything sends on a schedule.
 */
@Module({
  imports: [NotificationsCoreModule, SlackLinkReadModule, AnnouncementStoreModule],
  providers: [AnnouncementService],
  exports: [AnnouncementService],
})
export class AnnouncementModule {}
