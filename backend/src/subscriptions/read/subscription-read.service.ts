import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SubscriptionEntity } from '../core/entities/subscription.entity';
import {
  NotificationPreferencesNormalized,
  SubscriptionNormalized,
} from '../core/entities/subscription.interface';
import { normalizePreferences } from '../core/notification-preferences';

@Injectable()
export class SubscriptionReadService {
  constructor(
    @InjectModel(SubscriptionEntity.name) private subscriptionModel: Model<SubscriptionEntity>,
  ) {}

  public async readForUser(userId: string): Promise<SubscriptionNormalized[]> {
    const subscriptions = await this.subscriptionModel
      .find({ userId })
      .lean<SubscriptionEntity[]>()
      .exec();

    return subscriptions.map((subscription) => ({
      installationId: subscription.installationId,
      preferences: normalizePreferences(subscription),
    }));
  }

  /** Which of these people listen to at least one organisation. */
  public async readSubscribedUserIds(userIds: string[]): Promise<Set<string>> {
    const subscribed: string[] = await this.subscriptionModel
      .distinct('userId', { userId: { $in: userIds } })
      .exec();

    return new Set(subscribed);
  }

  /**
   * The webhook router's one read. Null means no opt-in, which is a different answer from
   * "opted in and wants nothing" - only the second one is a preference question.
   */
  public async readPreferences(
    userId: string,
    installationId: string,
  ): Promise<NotificationPreferencesNormalized | null> {
    const subscription = await this.subscriptionModel
      .findOne({ userId, installationId })
      .lean<SubscriptionEntity>()
      .exec();

    return subscription ? normalizePreferences(subscription) : null;
  }
}
