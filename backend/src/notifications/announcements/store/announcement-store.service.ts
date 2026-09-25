import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SlackDeliveryOutcome } from '../../delivery/slack-notification-delivery.service';
import { AnnouncementDeliveryEntity } from './entities/announcement-delivery.entity';
import { AnnouncementRunEntity } from './entities/announcement-run.entity';

export interface AnnouncementRun {
  startedAt: Date;
  completed: boolean;
}

@Injectable()
export class AnnouncementStoreService {
  constructor(
    @InjectModel(AnnouncementRunEntity.name) private runModel: Model<AnnouncementRunEntity>,
    @InjectModel(AnnouncementDeliveryEntity.name)
    private deliveryModel: Model<AnnouncementDeliveryEntity>,
  ) {}

  /**
   * The announcement's run, begun at `now` unless an earlier start already began it - in which
   * case that start's instant stands, and with it the audience it picked.
   */
  public async start(announcementId: string, now: Date): Promise<AnnouncementRun> {
    const run = await this.runModel
      .findOneAndUpdate(
        { announcementId },
        { $setOnInsert: { announcementId, startedAt: now } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean<AnnouncementRunEntity>()
      .exec();

    return { startedAt: run.startedAt, completed: Boolean(run.completedAt) };
  }

  public async complete(announcementId: string, now: Date): Promise<void> {
    await this.runModel.updateOne({ announcementId }, { $set: { completedAt: now } }).exec();
  }

  /**
   * Takes this person's copy, and answers whether this caller got it. An upsert rather than an
   * insert, so losing the race is an answer rather than a duplicate key error.
   */
  public async claim(announcementId: string, userId: string): Promise<boolean> {
    const result = await this.deliveryModel.updateOne(
      { announcementId, userId },
      { $setOnInsert: { announcementId, userId } },
      { upsert: true },
    );

    return result.upsertedCount === 1;
  }

  public async record(
    announcementId: string,
    userId: string,
    outcome: SlackDeliveryOutcome,
  ): Promise<void> {
    await this.deliveryModel.updateOne({ announcementId, userId }, { $set: { outcome } }).exec();
  }

  public async deleteForUser(userId: string): Promise<void> {
    await this.deliveryModel.deleteMany({ userId }).exec();
  }
}
