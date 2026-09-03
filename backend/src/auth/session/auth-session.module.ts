import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomJwtModule } from '../custom-jwt/custom-jwt.module';
import { AuthSessionController } from './auth-session.controller';
import { AuthSessionService } from './auth-session.service';
import { RefreshTokenEntity, RefreshTokenSchema } from './entities/refresh-token.entity';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RefreshTokenEntity.name, schema: RefreshTokenSchema }]),
    CustomJwtModule,
  ],
  controllers: [AuthSessionController],
  providers: [AuthSessionService, RefreshTokenService],
  // Logging in issues a session and deleting an account ends every one of them, so this is
  // imported by the GitHub login module and by the user module as well as mounted here.
  exports: [AuthSessionService],
})
export class AuthSessionModule {}
