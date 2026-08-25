import { Module } from '@nestjs/common';
import { InboxWarmCoreModule } from '../core/inbox-warm-core.module';
import { InboxWarmReadService } from './inbox-warm-read.service';

@Module({
  imports: [InboxWarmCoreModule],
  providers: [InboxWarmReadService],
  exports: [InboxWarmReadService],
})
export class InboxWarmReadModule {}
