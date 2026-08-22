import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InMemoryCacheModule } from '../shared/cache/in-memory-cache.module';
import { UserReadModule } from '../user/read/user-read.module';
import { UserWriteModule } from '../user/write/user-write.module';
import {
  InboxSnapshotEntity,
  InboxSnapshotSchema,
} from './core/entities/inbox-snapshot.entity';
import { GithubInboxDataService } from './github-inbox-data.service';
import { GithubViewerTeammatesDataService } from './github-viewer-teammates-data.service';
import { InboxController } from './inbox.controller';
import { InboxRefreshService } from './inbox-refresh.service';
import { InboxService } from './inbox.service';
import { InboxReadService } from './read/inbox-read.service';
import { InboxWriteService } from './write/inbox-write.service';

/**
 * Flatter than the modules around it, because nothing outside owns any of this yet. The read and
 * write services are split anyway - the sweep that is coming writes without reading, and the
 * endpoint reads without writing, and keeping that visible now is cheaper than untangling it
 * later.
 *
 * InboxRefreshService is exported for exactly that: it is what a scheduler will call.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InboxSnapshotEntity.name, schema: InboxSnapshotSchema },
    ]),
    InMemoryCacheModule,
    UserReadModule,
    UserWriteModule,
  ],
  controllers: [InboxController],
  providers: [
    InboxService,
    InboxRefreshService,
    InboxReadService,
    InboxWriteService,
    GithubInboxDataService,
    GithubViewerTeammatesDataService,
  ],
  exports: [InboxRefreshService],
})
export class InboxModule {}
