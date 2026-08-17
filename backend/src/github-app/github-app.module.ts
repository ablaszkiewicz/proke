import { Module } from '@nestjs/common';
import { InMemoryCacheModule } from '../shared/cache/in-memory-cache.module';
import { GithubAppInstallationsService } from './github-app-installations.service';
import { GithubAppJwtService } from './github-app-jwt.service';
import { GithubAppTokenService } from './github-app-token.service';
import { GithubPullRequestDataService } from './github-pull-request-data.service';
import { GithubTeamMembersDataService } from './github-team-members-data.service';

@Module({
  imports: [InMemoryCacheModule],
  providers: [
    GithubAppJwtService,
    GithubAppInstallationsService,
    GithubAppTokenService,
    GithubTeamMembersDataService,
    GithubPullRequestDataService,
  ],
  exports: [
    GithubAppJwtService,
    GithubAppInstallationsService,
    GithubAppTokenService,
    GithubTeamMembersDataService,
    GithubPullRequestDataService,
  ],
})
export class GithubAppModule {}
