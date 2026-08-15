import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionEntity, SubscriptionSchema } from './entities/subscription.entity';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SubscriptionEntity.name, schema: SubscriptionSchema }]),
  ],
  exports: [MongooseModule],
})
export class SubscriptionCoreModule {}
