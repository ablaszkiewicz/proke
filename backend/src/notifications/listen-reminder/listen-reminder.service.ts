import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AnalyticsService } from '../../analytics/analytics.service';
import { MetricsService } from '../../analytics/metrics.service';
import { pool } from '../../shared/async/pool';
import { getEnvConfig } from '../../shared/configs/env-configs';
import { SlackLinkReadService } from '../../slack/links/read/slack-link-read.service';
import { SubscriptionReadService } from '../../subscriptions/read/subscription-read.service';
import { UserReadService } from '../../user/read/user-read.service';
import { UserWriteService } from '../../user/write/user-write.service';
import {
  SlackDeliveryOutcome,
  SlackNotificationDeliveryService,
} from '../delivery/slack-notification-delivery.service';

/**
 * How often somebody is reminded, and how long after connecting Slack the first one waits - so
 * somebody halfway through setting up is not told off for it the same afternoon.
 */
export const LISTEN_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60_000;

/** After the announcements' thirty seconds, so a deploy never lands both at once. */
const FIRST_SWEEP_DELAY_MS = 60_000;

/** The announcements' two, for their reason: back to back, and often many in one workspace. */
const CONCURRENCY = 2;

/** What one person's reminder came to: a Slack outcome, somebody else's, or this code throwing. */
type ListenReminderOutcome = SlackDeliveryOutcome | 'claimed_already' | 'errored';

/** Who pressed "Never remind me again", and on which message. */
export interface ListenReminderStop {
  userId: string;
  teamId?: string;
  channelId?: string;
  messageTs?: string;
}

/**
 * The weekly reminder to somebody who connected Slack and listens to no organisation.
 *
 * They are the one kind of user proke can reach and has nothing to say to, so without this they
 * are told once - by the welcome message - and then hear nothing, forever.
 *
 * Once a week at most, and never again after "Never remind me again". Slack messages cannot be
 * taken back, so each week is claimed before it is sent and only the pass that wins it posts.
 * See UserWriteService.claimListenReminder.
 */
@Injectable()
export class ListenReminderService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ListenReminderService.name);
  private firstSweep?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(
    private readonly linkReadService: SlackLinkReadService,
    private readonly subscriptionReadService: SubscriptionReadService,
    private readonly userReadService: UserReadService,
    private readonly userWriteService: UserWriteService,
    private readonly deliveryService: SlackNotificationDeliveryService,
    private readonly analytics: AnalyticsService,
    private readonly metrics: MetricsService,
  ) {}

  public onApplicationBootstrap(): void {
    const intervalMs = getEnvConfig().notifications.listenReminderSweepIntervalMs;

    if (intervalMs <= 0) {
      this.logger.log('Listen reminders are off (LISTEN_REMINDER_SWEEP_INTERVAL_MS is 0)');

      return;
    }

    this.firstSweep = setTimeout(() => void this.sweep(), FIRST_SWEEP_DELAY_MS);
    this.firstSweep.unref?.();

    this.timer = setInterval(() => void this.sweep(), intervalMs);
    this.timer.unref?.();

    this.logger.log(`Listen reminder sweep every ${Math.round(intervalMs / 60_000)}m`);
  }

  public onModuleDestroy(): void {
    clearTimeout(this.firstSweep);
    clearInterval(this.timer);
  }

  /** `now` is passed so a spec can pin the clock and step a week forward. */
  public async sweep(now: Date = new Date()): Promise<void> {
    if (this.sweeping) {
      this.metrics.count('proke.listen_reminder.sweeps', { outcome: 'overlapped' });

      return;
    }

    this.sweeping = true;

    try {
      const weekAgo = new Date(now.getTime() - LISTEN_REMINDER_INTERVAL_MS);
      const linked = await this.linkReadService.readUserIdsLinkedBy(weekAgo);
      const listening = await this.subscriptionReadService.readSubscribedUserIds(linked);
      const due = await this.userReadService.readListenReminderDue(
        linked.filter((userId) => !listening.has(userId)),
        weekAgo,
      );

      const tally = new Map<ListenReminderOutcome, number>();

      await pool(due, CONCURRENCY, async (userId) => {
        const outcome = await this.remind(userId, now, weekAgo);
        tally.set(outcome, (tally.get(outcome) ?? 0) + 1);
      });

      if (tally.size > 0) {
        const summary = [...tally].map(([outcome, count]) => `${count} ${outcome}`).join(', ');
        this.logger.log(`Listen reminders: ${summary}`);
      }

      this.metrics.count('proke.listen_reminder.sweeps', { outcome: 'completed' });
    } catch (error) {
      this.metrics.count('proke.listen_reminder.sweeps', { outcome: 'failed' });
      this.logger.error(`Listen reminder sweep failed: ${describe(error)}`);
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * "Never remind me again", pressed in Slack. Stored first, then the message is edited to say so:
   * the edit is the part that can fail, and a stale button is the lesser of the two problems.
   */
  public async stop(press: ListenReminderStop, now: Date = new Date()): Promise<void> {
    if (await this.userWriteService.stopListenReminder(press.userId, now)) {
      this.analytics.capture(press.userId, 'listen_reminder_stopped');
    }

    if (press.teamId && press.channelId && press.messageTs) {
      await this.deliveryService.confirmListenReminderStopped(
        press.teamId,
        press.channelId,
        press.messageTs,
      );
    }
  }

  /**
   * Claimed before it is sent, so a failed send spends the week rather than repeating every
   * hour. Never throws: pool's workers must not.
   */
  private async remind(userId: string, now: Date, weekAgo: Date): Promise<ListenReminderOutcome> {
    try {
      if (!(await this.userWriteService.claimListenReminder(userId, now, weekAgo))) {
        return 'claimed_already';
      }

      return await this.deliveryService.deliverListenReminder(userId);
    } catch (error) {
      this.logger.error(`Failed to send a listen reminder to user ${userId}: ${describe(error)}`);

      return 'errored';
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
