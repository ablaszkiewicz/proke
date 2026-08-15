import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserEntity, UserSchema } from '../core/entities/user.entity';
import { UserWriteService } from './user-write.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }])],
  providers: [UserWriteService],
  exports: [UserWriteService],
})
export class UserWriteModule {}
