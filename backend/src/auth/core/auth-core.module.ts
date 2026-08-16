import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UserWriteModule } from '../../user/write/user-write.module';
import { CustomJwtModule } from '../custom-jwt/custom-jwt.module';
import { GithubAuthModule } from '../github/github-auth.module';
import { AuthGuard } from './guards/auth.guard';

@Module({
  // UserWriteModule so the guard can stamp lastActivityDate - see AuthGuard.canActivate.
  imports: [GithubAuthModule, CustomJwtModule, UserWriteModule],
  providers: [AuthGuard, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthCoreModule {}
