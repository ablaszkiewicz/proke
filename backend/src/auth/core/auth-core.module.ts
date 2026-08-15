import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CustomJwtModule } from '../custom-jwt/custom-jwt.module';
import { GithubAuthModule } from '../github/github-auth.module';
import { AuthGuard } from './guards/auth.guard';

@Module({
  imports: [GithubAuthModule, CustomJwtModule],
  providers: [AuthGuard, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthCoreModule {}
