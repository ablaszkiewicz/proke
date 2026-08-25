import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InboxWarmPinEntity } from '../core/entities/inbox-warm-pin.entity';
import { InboxWarmPin, normalizeWarmPins } from '../core/entities/inbox-warm-pin.interface';

/** One person's pins, as the sweep reads them. */
export interface UserWarmPins {
  userId: string;
  pins: InboxWarmPin[];
}

@Injectable()
export class InboxWarmReadService {
  constructor(
    @InjectModel(InboxWarmPinEntity.name)
    private readonly warmPinModel: Model<InboxWarmPinEntity>,
  ) {}

  public async readForUser(userId: string): Promise<InboxWarmPin[]> {
    const document = await this.warmPinModel.findOne({ userId }).lean<InboxWarmPinEntity>().exec();

    return normalizeWarmPins(document?.pins);
  }

  /**
   * Everybody's pins, for the sweep.
   *
   * One unbounded read, which is honest at this size and would not be at a hundred times it: the
   * collection holds one small document per person who has ever pressed the button, and the
   * sweep needs all of them anyway. The growth path is a cursor, and the metric that says when
   * to reach for one is `proke.inbox.warm.duration` - if a sweep is approaching its own
   * interval, reading the list was never the expensive part.
   *
   * Documents with no pins left are skipped here rather than deleted on removal, so a person
   * turning their last one off costs one `$pull` instead of a write and a conditional delete.
   */
  public async readAll(): Promise<UserWarmPins[]> {
    const documents = await this.warmPinModel.find({}).lean<InboxWarmPinEntity[]>().exec();

    return documents
      .map((document) => ({
        userId: document.userId,
        pins: normalizeWarmPins(document.pins),
      }))
      .filter((entry) => entry.pins.length > 0);
  }
}
