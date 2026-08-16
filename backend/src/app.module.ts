import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthCoreModule } from './auth/core/auth-core.module';
import { ConnectionsModule } from './connections/connections.module';
import { getEnvConfig } from './shared/configs/env-configs';
import { SlackModule } from './slack/slack.module';
import { UserCoreModule } from './user/core/user-core.module';
import { GithubWebhookModule } from './webhooks/github/github-webhook.module';
import { SlackEventsModule } from './webhooks/slack/slack-events.module';

@Module({
  imports: [
    MongooseModule.forRoot(getEnvConfig().mongo.url),
    AuthCoreModule,
    UserCoreModule,
    ConnectionsModule,
    SlackModule,
    GithubWebhookModule,
    SlackEventsModule,
  ],
})
export class AppModule {}
