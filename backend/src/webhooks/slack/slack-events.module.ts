import { Module } from '@nestjs/common';
import { SlackAppModule } from '../../slack/app/slack-app.module';
import { SlackLinkWriteModule } from '../../slack/links/write/slack-link-write.module';
import { SlackWorkspaceWriteModule } from '../../slack/workspaces/write/slack-workspace-write.module';
import { SlackEventsController } from './slack-events.controller';

@Module({
  imports: [SlackAppModule, SlackLinkWriteModule, SlackWorkspaceWriteModule],
  controllers: [SlackEventsController],
})
export class SlackEventsModule {}
