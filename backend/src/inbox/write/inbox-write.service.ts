import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InboxSnapshotEntity } from '../core/entities/inbox-snapshot.entity';
import { InboxSnapshot } from '../core/entities/inbox.interface';

@Injectable()
export class InboxWriteService {
  constructor(
    @InjectModel(InboxSnapshotEntity.name)
    private snapshotModel: Model<InboxSnapshotEntity>,
  ) {}

  /**
   * Replaces the whole snapshot. There is nothing to merge: one GraphQL query answers the
   * complete truth for a user, so a pull request that is not in the new document is one that is
   * no longer in their inbox.
   *
   * Upsert rather than update, because the first refresh for a user has nothing to update.
   */
  public async upsert(snapshot: InboxSnapshot): Promise<void> {
    await this.snapshotModel
      .updateOne(
        { userId: snapshot.userId },
        {
          $set: {
            refreshedAt: snapshot.refreshedAt,
            yours: snapshot.yours,
            waitingOnYou: snapshot.waitingOnYou,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  public async delete(userId: string): Promise<void> {
    await this.snapshotModel.deleteOne({ userId }).exec();
  }
}
