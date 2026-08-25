import { Module } from '@nestjs/common';
import { InboxWarmCoreModule } from '../core/inbox-warm-core.module';
import { InboxWarmWriteService } from './inbox-warm-write.service';

/**
 * Deliberately knows nothing but its own collection.
 *
 * UserCoreModule imports this so account deletion can clear the pins, and the warmer imports
 * InboxModule to refresh them. Keeping writing in a module of its own is what stops those two
 * meeting in a cycle.
 */
@Module({
  imports: [InboxWarmCoreModule],
  providers: [InboxWarmWriteService],
  exports: [InboxWarmWriteService],
})
export class InboxWarmWriteModule {}
