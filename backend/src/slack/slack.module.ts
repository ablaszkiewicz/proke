import { Module } from '@nestjs/common';
import { NotificationsCoreModule } from '../notifications/core/notifications-core.module';
import { UserReadModule } from '../user/read/user-read.module';
import { SlackAppModule } from './app/slack-app.module';
import { SlackLinkReadModule } from './links/read/slack-link-read.module';
import { SlackLinkWriteModule } from './links/write/slack-link-write.module';
import { SlackController } from './slack.controller';
import { SlackService } from './slack.service';
import { SlackWorkspaceReadModule } from './workspaces/read/slack-workspace-read.module';
import { SlackWorkspaceWriteModule } from './workspaces/write/slack-workspace-write.module';

@Module({
  imports: [
    UserReadModule,
    SlackAppModule,
    SlackLinkReadModule,
    SlackLinkWriteModule,
    SlackWorkspaceReadModule,
    SlackWorkspaceWriteModule,
    NotificationsCoreModule,
  ],
  controllers: [SlackController],
  providers: [SlackService],
})
export class SlackModule {}
