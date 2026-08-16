import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CryptoModule } from '../../shared/crypto/crypto.module';
import { UserEntity, UserSchema } from '../core/entities/user.entity';
import { UserWriteService } from './user-write.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }]),
    CryptoModule,
  ],
  providers: [UserWriteService],
  exports: [UserWriteService],
})
export class UserWriteModule {}
