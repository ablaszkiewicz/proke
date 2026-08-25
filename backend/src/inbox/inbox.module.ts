import { Module } from '@nestjs/common';
import { InMemoryCacheModule } from '../shared/cache/in-memory-cache.module';
import { UserReadModule } from '../user/read/user-read.module';
import { UserWriteModule } from '../user/write/user-write.module';
import { GithubInboxDataService } from './github-inbox-data.service';
import { GithubViewerTeamsDataService } from './github-viewer-teams-data.service';
import { InboxController } from './inbox.controller';
import { InboxRefreshService } from './inbox-refresh.service';
import { InboxStoreService } from './inbox-store.service';
import { InboxService } from './inbox.service';

/**
 * No Mongoose here, and that is the point: a built inbox is a copy of what GitHub said, so it
 * lives in the process cache rather than in a collection of its own. See InboxStoreService.
 *
 * The settings that say which snapshot to build for somebody are a different kind of thing - a
 * stated choice, derivable from nothing - so they are stored, on the user row. This module
 * writes them through UserWriteModule; the rule it keeps is about the snapshot, not about the
 * settings.
 *
 * InboxRefreshService is exported because it is what a scheduler calls - see InboxWarmerService
 * next door, which is that scheduler.
 */
@Module({
  imports: [InMemoryCacheModule, UserReadModule, UserWriteModule],
  controllers: [InboxController],
  providers: [
    InboxService,
    InboxRefreshService,
    InboxStoreService,
    GithubInboxDataService,
    GithubViewerTeamsDataService,
  ],
  exports: [InboxRefreshService],
})
export class InboxModule {}
