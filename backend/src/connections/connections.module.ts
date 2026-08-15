import { Module } from '@nestjs/common';
import { GithubAppModule } from '../github-app/github-app.module';
import { InstallationWriteModule } from '../installations/write/installation-write.module';
import { SubscriptionReadModule } from '../subscriptions/read/subscription-read.module';
import { SubscriptionWriteModule } from '../subscriptions/write/subscription-write.module';
import { UserReadModule } from '../user/read/user-read.module';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { GithubOrgMembershipDataService } from './github-org-membership-data.service';
import { GithubUserInstallationsDataService } from './github-user-installations-data.service';

@Module({
  imports: [
    UserReadModule,
    SubscriptionReadModule,
    SubscriptionWriteModule,
    InstallationWriteModule,
    GithubAppModule,
  ],
  controllers: [ConnectionsController],
  providers: [
    ConnectionsService,
    GithubUserInstallationsDataService,
    GithubOrgMembershipDataService,
  ],
})
export class ConnectionsModule {}
