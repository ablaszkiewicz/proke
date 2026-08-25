import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox.module';
import { UserReadModule } from '../../user/read/user-read.module';
import { InboxWarmerService } from './inbox-warmer.service';

/**
 * The timer that keeps inboxes ready.
 *
 * Sits above InboxModule rather than inside it, because it is the scheduler that module's export
 * comment refers to: InboxModule exports `InboxRefreshService` and knows nothing about who wants
 * it called. There is nothing else here - what to warm for whom is read off the user row, which
 * the inbox settings route writes and UserReadModule reads.
 */
@Module({
  imports: [InboxModule, UserReadModule],
  providers: [InboxWarmerService],
  exports: [InboxWarmerService],
})
export class InboxWarmModule {}
