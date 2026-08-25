import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox.module';
import { UserReadModule } from '../../user/read/user-read.module';
import { InboxWarmController } from './inbox-warm.controller';
import { InboxWarmerService } from './inbox-warmer.service';
import { InboxWarmReadModule } from './read/inbox-warm-read.module';
import { InboxWarmWriteModule } from './write/inbox-warm-write.module';

/**
 * Keeping chosen views ready, and the timer that does it.
 *
 * Sits above InboxModule rather than inside it, because it is the scheduler that module's
 * export comment has been waiting for: InboxModule exports `InboxRefreshService` and knows
 * nothing about who wants it called. Which is also what keeps deletion out of a cycle -
 * UserCoreModule needs only InboxWarmWriteModule, and that knows about its own collection and
 * nothing else.
 */
@Module({
  imports: [InboxModule, UserReadModule, InboxWarmReadModule, InboxWarmWriteModule],
  controllers: [InboxWarmController],
  providers: [InboxWarmerService],
  exports: [InboxWarmerService],
})
export class InboxWarmModule {}
