import { Module } from '@nestjs/common';
import { ListenReminderModule } from '../../notifications/listen-reminder/listen-reminder.module';
import { SlackAppModule } from '../../slack/app/slack-app.module';
import { SlackLinkWriteModule } from '../../slack/links/write/slack-link-write.module';
import { SlackWorkspaceWriteModule } from '../../slack/workspaces/write/slack-workspace-write.module';
import { SlackEventsController } from './slack-events.controller';
import { SlackInteractionsController } from './slack-interactions.controller';

@Module({
  imports: [SlackAppModule, SlackLinkWriteModule, SlackWorkspaceWriteModule, ListenReminderModule],
  controllers: [SlackEventsController, SlackInteractionsController],
})
export class SlackEventsModule {}
