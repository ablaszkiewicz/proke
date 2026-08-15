import { Module } from '@nestjs/common';
import { GithubAppInstallationsService } from './github-app-installations.service';
import { GithubAppJwtService } from './github-app-jwt.service';

@Module({
  providers: [GithubAppJwtService, GithubAppInstallationsService],
  exports: [GithubAppJwtService, GithubAppInstallationsService],
})
export class GithubAppModule {}
