import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SubscriptionEntity } from '../core/entities/subscription.entity';
import {
  NotificationPreferencesNormalized,
  RepositoryScope,
} from '../core/entities/subscription.interface';
import { defaultPreferences } from '../core/notification-preferences';

@Injectable()
export class SubscriptionWriteService {
  constructor(
    @InjectModel(SubscriptionEntity.name) private subscriptionModel: Model<SubscriptionEntity>,
  ) {}

  /**
   * Upsert so a double-click on Subscribe is not a duplicate-key error in the user's face.
   *
   * The defaults go in on insert only: re-subscribing after unsubscribing starts fresh, but a
   * redundant subscribe must never quietly reset preferences somebody chose.
   */
  public async create(userId: string, installationId: string): Promise<void> {
    const preferences = defaultPreferences();

    await this.subscriptionModel.updateOne(
      { userId, installationId },
      {
        $setOnInsert: {
          userId,
          installationId,
          repositoryScope: preferences.repositoryScope,
          notificationTypes: preferences.notificationTypes,
          repositories: preferences.repositories,
        },
      },
      { upsert: true },
    );
  }

  /**
   * Replaces the whole preference set rather than patching it - partial updates of a nested
   * repository list are where lost-update bugs live. Returns false when there is no
   * subscription to update, so the caller can tell that apart from a successful write.
   */
  public async updatePreferences(
    userId: string,
    installationId: string,
    preferences: NotificationPreferencesNormalized,
  ): Promise<boolean> {
    const result = await this.subscriptionModel.updateOne(
      { userId, installationId },
      {
        $set: {
          repositoryScope: preferences.repositoryScope ?? RepositoryScope.All,
          notificationTypes: preferences.notificationTypes,
          repositories: preferences.repositories,
        },
      },
    );

    return result.matchedCount > 0;
  }

  public async delete(userId: string, installationId: string): Promise<void> {
    await this.subscriptionModel.deleteOne({ userId, installationId });
  }

  // When an installation disappears, so does every opt-in to it - otherwise a reinstall
  // would silently resurrect subscriptions nobody re-consented to.
  public async deleteByInstallation(installationId: string): Promise<void> {
    await this.subscriptionModel.deleteMany({ installationId });
  }

  /** Every opt-in this user ever made. Part of deleting the account. */
  public async deleteForUser(userId: string): Promise<void> {
    await this.subscriptionModel.deleteMany({ userId });
  }
}
