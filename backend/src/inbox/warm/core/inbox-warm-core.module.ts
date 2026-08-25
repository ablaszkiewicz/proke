import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InboxWarmPinEntity, InboxWarmPinSchema } from './entities/inbox-warm-pin.entity';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: InboxWarmPinEntity.name, schema: InboxWarmPinSchema }]),
  ],
  exports: [MongooseModule],
})
export class InboxWarmCoreModule {}
