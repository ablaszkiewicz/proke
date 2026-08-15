import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserEntity, UserSchema } from '../core/entities/user.entity';
import { UserReadService } from './user-read.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }])],
  providers: [UserReadService],
  exports: [UserReadService],
})
export class UserReadModule {}
