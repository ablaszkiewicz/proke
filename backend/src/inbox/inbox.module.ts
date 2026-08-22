import { Module } from '@nestjs/common';
import { InMemoryCacheModule } from '../shared/cache/in-memory-cache.module';
import { UserReadModule } from '../user/read/user-read.module';
import { UserWriteModule } from '../user/write/user-write.module';
import { GithubInboxDataService } from './github-inbox-data.service';
import { GithubViewerTeammatesDataService } from './github-viewer-teammates-data.service';
import { InboxController } from './inbox.controller';
import { InboxRefreshService } from './inbox-refresh.service';
import { InboxStoreService } from './inbox-store.service';
import { InboxService } from './inbox.service';

/**
 * No Mongoose here, and that is the point: a built inbox is a copy of what GitHub said, so it
 * lives in the process cache rather than in a collection of its own. See InboxStoreService.
 *
 * InboxRefreshService is exported because it is what a scheduler will call.
 */
@Module({
  imports: [InMemoryCacheModule, UserReadModule, UserWriteModule],
  controllers: [InboxController],
  providers: [
    InboxService,
    InboxRefreshService,
    InboxStoreService,
    GithubInboxDataService,
    GithubViewerTeammatesDataService,
  ],
  exports: [InboxRefreshService],
})
export class InboxModule {}
