import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UserWriteModule } from '../../user/write/user-write.module';
import { CustomJwtModule } from '../custom-jwt/custom-jwt.module';
import { GithubAuthModule } from '../github/github-auth.module';
import { AuthSessionModule } from '../session/auth-session.module';
import { AuthGuard } from './guards/auth.guard';

@Module({
  // UserWriteModule so the guard can stamp lastActivityDate - see AuthGuard.canActivate.
  // AuthSessionModule so /auth/refresh and /auth/logout are mounted - the routes that let a
  // one-hour access token be the whole of what a request carries.
  imports: [GithubAuthModule, AuthSessionModule, CustomJwtModule, UserWriteModule],
  providers: [AuthGuard, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthCoreModule {}
