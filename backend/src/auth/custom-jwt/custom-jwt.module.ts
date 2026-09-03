import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getEnvConfig } from '../../shared/configs/env-configs';
import { CustomJwtService } from './custom-jwt.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: getEnvConfig().auth.jwtSecret,
      // An hour by default, where this used to be a week. A week was only tolerable because
      // there was nothing else to keep somebody signed in; now a refresh token does that, and
      // the access token can be as short as the thing it protects deserves. See
      // auth.accessTokenTtlSeconds.
      signOptions: { expiresIn: getEnvConfig().auth.accessTokenTtlSeconds },
    }),
  ],
  providers: [CustomJwtService],
  exports: [CustomJwtService],
})
export class CustomJwtModule {}
