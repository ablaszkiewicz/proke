import { Module } from '@nestjs/common';
import { UserReadModule } from '../read/user-read.module';
import { UserWriteModule } from '../write/user-write.module';
import { UserCoreController } from './user-core.controller';

@Module({
  imports: [UserReadModule, UserWriteModule],
  controllers: [UserCoreController],
})
export class UserCoreModule {}
