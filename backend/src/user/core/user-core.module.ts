import { Module } from '@nestjs/common';
import { InboxWarmWriteModule } from '../../inbox/warm/write/inbox-warm-write.module';
import { PokeMessageWriteModule } from '../../notifications/messages/write/poke-message-write.module';
import { SlackLinkWriteModule } from '../../slack/links/write/slack-link-write.module';
import { SlackWorkspaceWriteModule } from '../../slack/workspaces/write/slack-workspace-write.module';
import { SubscriptionWriteModule } from '../../subscriptions/write/subscription-write.module';
import { UserReadModule } from '../read/user-read.module';
import { UserWriteModule } from '../write/user-write.module';
import { UserCoreController } from './user-core.controller';
import { UserDeletionService } from './user-deletion.service';

@Module({
  imports: [
    UserReadModule,
    UserWriteModule,
    // Deleting an account reaches into every collection keyed on a user id, which is why this
    // module knows about Slack and subscriptions at all.
    SubscriptionWriteModule,
    SlackLinkWriteModule,
    SlackWorkspaceWriteModule,
    PokeMessageWriteModule,
    InboxWarmWriteModule,
  ],
  controllers: [UserCoreController],
  providers: [UserDeletionService],
})
export class UserCoreModule {}
