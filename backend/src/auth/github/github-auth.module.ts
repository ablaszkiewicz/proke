import { Module } from '@nestjs/common';
import { UserReadModule } from '../../user/read/user-read.module';
import { UserWriteModule } from '../../user/write/user-write.module';
import { AuthSessionModule } from '../session/auth-session.module';
import { GithubAuthDataService } from './github-auth-data.service';
import { GithubAuthLoginService } from './github-auth-login.service';
import { GithubAuthController } from './github-auth.controller';

@Module({
  imports: [UserReadModule, UserWriteModule, AuthSessionModule],
  controllers: [GithubAuthController],
  providers: [GithubAuthLoginService, GithubAuthDataService],
})
export class GithubAuthModule {}
