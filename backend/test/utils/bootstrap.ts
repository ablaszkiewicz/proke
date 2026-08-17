import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model } from 'mongoose';
import * as nock from 'nock';
import { AnalyticsModule } from '../../src/analytics/analytics.module';
import { AuthCoreModule } from '../../src/auth/core/auth-core.module';
import { ConnectionsModule } from '../../src/connections/connections.module';
import { InstallationEntity } from '../../src/installations/core/entities/installation.entity';
import { NotificationDeliveryService } from '../../src/notifications/delivery/notification-delivery.service';
import { SlackNotificationDeliveryService } from '../../src/notifications/delivery/slack-notification-delivery.service';
import { SlackLinkEntity } from '../../src/slack/links/core/entities/slack-link.entity';
import { SlackModule } from '../../src/slack/slack.module';
import { SlackWorkspaceEntity } from '../../src/slack/workspaces/core/entities/slack-workspace.entity';
import { InMemoryCacheService } from '../../src/shared/cache/in-memory-cache.service';
import { buildValidationPipe } from '../../src/shared/validation/validation-pipe';
import { SubscriptionEntity } from '../../src/subscriptions/core/entities/subscription.entity';
import { UserEntity } from '../../src/user/core/entities/user.entity';
import { UserCoreModule } from '../../src/user/core/user-core.module';
import { UserReadService } from '../../src/user/read/user-read.service';
import { UserWriteService } from '../../src/user/write/user-write.service';
import { GithubWebhookModule } from '../../src/webhooks/github/github-webhook.module';
import { SlackEventsModule } from '../../src/webhooks/slack/slack-events.module';
import { AuthUtils } from './auth-utils';
import { closeInMemoryMongoServer, rootMongooseTestModule } from './mongo-in-memory-server';

export async function createTestApp() {
  const module: TestingModule = await Test.createTestingModule({
    imports: [
      rootMongooseTestModule(),
      // Global in app.module.ts, so it has to be listed here too or every service that
      // captures fails to resolve. With no POSTHOG_API_KEY - which the suite never sets - it
      // provides a client that does nothing, so no spec makes a network call to PostHog.
      AnalyticsModule,
      AuthCoreModule,
      UserCoreModule,
      ConnectionsModule,
      SlackModule,
      GithubWebhookModule,
      SlackEventsModule,
    ],
  }).compile();

  // Mirrors main.ts: webhook signature verification reads req.rawBody.
  const app = module.createNestApplication({ rawBody: true });
  // The same builder main.ts uses. Constructing a second pipe here is what let the two drift,
  // and let a production-only coercion bug sit under a green suite.
  app.useGlobalPipes(buildValidationPipe());
  await app.init();

  const userModel: Model<UserEntity> = module.get(getModelToken(UserEntity.name));
  const installationModel: Model<InstallationEntity> = module.get(
    getModelToken(InstallationEntity.name),
  );
  const subscriptionModel: Model<SubscriptionEntity> = module.get(
    getModelToken(SubscriptionEntity.name),
  );
  const slackWorkspaceModel: Model<SlackWorkspaceEntity> = module.get(
    getModelToken(SlackWorkspaceEntity.name),
  );
  const slackLinkModel: Model<SlackLinkEntity> = module.get(getModelToken(SlackLinkEntity.name));
  const inMemoryCacheService = app.get(InMemoryCacheService);

  const clearDatabase = async () => {
    await userModel.deleteMany({});
    await installationModel.deleteMany({});
    await subscriptionModel.deleteMany({});
    await slackWorkspaceModel.deleteMany({});
    await slackLinkModel.deleteMany({});
  };

  const beforeEach = async () => {
    await clearDatabase();
    nock.cleanAll();
    // Outlives the database, so without this a team one spec looked up is still known in the next.
    inMemoryCacheService.clear();
  };

  const afterAll = async () => {
    await app.close();
    await closeInMemoryMongoServer();
  };

  return {
    app,
    module,
    models: {
      userModel,
      installationModel,
      subscriptionModel,
      slackWorkspaceModel,
      slackLinkModel,
    },
    services: {
      notificationDeliveryService: app.get(NotificationDeliveryService),
      slackNotificationDeliveryService: app.get(SlackNotificationDeliveryService),
      // So a spec can go through the same paths the app uses - the only way to assert that an
      // encrypted-at-rest token still comes out usable, or that claiming a handle releases it
      // from whoever held it before.
      userReadService: app.get(UserReadService),
      userWriteService: app.get(UserWriteService),
      inMemoryCacheService,
    },
    utils: {
      authUtils: new AuthUtils(app),
    },
    methods: {
      clearDatabase,
      afterAll,
      beforeEach,
    },
  };
}
