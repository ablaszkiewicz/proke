import { Module } from '@nestjs/common';
import { SubscriptionCoreModule } from '../core/subscription-core.module';
import { SubscriptionReadService } from './subscription-read.service';

@Module({
  imports: [SubscriptionCoreModule],
  providers: [SubscriptionReadService],
  exports: [SubscriptionReadService],
})
export class SubscriptionReadModule {}
