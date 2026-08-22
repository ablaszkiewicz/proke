import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InboxSnapshotEntity } from '../core/entities/inbox-snapshot.entity';
import { InboxSnapshot } from '../core/entities/inbox.interface';

@Injectable()
export class InboxReadService {
  constructor(
    @InjectModel(InboxSnapshotEntity.name)
    private snapshotModel: Model<InboxSnapshotEntity>,
  ) {}

  public async read(userId: string): Promise<InboxSnapshot | null> {
    const snapshot = await this.snapshotModel
      .findOne({ userId })
      .lean<InboxSnapshotEntity>()
      .exec();

    if (!snapshot) {
      return null;
    }

    return {
      userId: snapshot.userId,
      refreshedAt: snapshot.refreshedAt,
      yours: snapshot.yours ?? [],
      waitingOnYou: snapshot.waitingOnYou ?? [],
    };
  }
}
