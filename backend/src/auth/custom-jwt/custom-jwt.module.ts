import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getEnvConfig } from '../../shared/configs/env-configs';
import { CustomJwtService } from './custom-jwt.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: getEnvConfig().auth.jwtSecret,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [CustomJwtService],
  exports: [CustomJwtService],
})
export class CustomJwtModule {}
