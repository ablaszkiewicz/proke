import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InMemoryCacheModule } from '../../shared/cache/in-memory-cache.module';
import { CryptoModule } from '../../shared/crypto/crypto.module';
import { UserEntity, UserSchema } from '../core/entities/user.entity';
import { UserReadService } from './user-read.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }]),
    CryptoModule,
    InMemoryCacheModule,
  ],
  providers: [UserReadService],
  exports: [UserReadService],
})
export class UserReadModule {}
