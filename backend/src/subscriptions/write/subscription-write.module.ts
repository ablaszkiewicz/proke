import { Module } from '@nestjs/common';
import { SubscriptionCoreModule } from '../core/subscription-core.module';
import { SubscriptionWriteService } from './subscription-write.service';

@Module({
  imports: [SubscriptionCoreModule],
  providers: [SubscriptionWriteService],
  exports: [SubscriptionWriteService],
})
export class SubscriptionWriteModule {}
