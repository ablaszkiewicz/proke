import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { pool } from '../../shared/async/pool';
import { getEnvConfig } from '../../shared/configs/env-configs';
import { SlackLinkReadService } from '../../slack/links/read/slack-link-read.service';
import {
  SlackDeliveryOutcome,
  SlackNotificationDeliveryService,
} from '../delivery/slack-notification-delivery.service';
import { announcementProblems } from './announcement-rules';
import { Announcement } from './announcement.interface';
import { ANNOUNCEMENTS } from './announcements';
import { AnnouncementStoreService } from './store/announcement-store.service';

/** Long enough that a deploy is settled and serving before anything is posted. */
const FIRST_RUN_DELAY_MS = 30_000;

/**
 * Lower than the digest's four. Every recipient is sent to back to back, many of them in one
 * workspace, and each first message there costs a conversations.open as well as the post.
 */
const CONCURRENCY = 2;

/** What one person's copy came to: a Slack outcome, somebody else's, or this code throwing. */
type AnnouncementOutcome = SlackDeliveryOutcome | 'claimed_already' | 'errored';

/**
 * Sends each announcement in ANNOUNCEMENTS to everybody who has not had it yet, once per start.
 *
 * In order, and stopping at the first one that cannot finish, the way migrations run: somebody
 * who is sent the second is somebody who was already sent the first.
 *
 * Slack messages cannot be taken back, so every copy is claimed before it is sent and only the
 * pass that wins the claim posts. See AnnouncementDeliveryEntity.
 */
@Injectable()
export class AnnouncementService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementService.name);
  private firstRun?: NodeJS.Timeout;

  constructor(
    private readonly store: AnnouncementStoreService,
    private readonly linkReadService: SlackLinkReadService,
    private readonly deliveryService: SlackNotificationDeliveryService,
  ) {}

  public onApplicationBootstrap(): void {
    if (!getEnvConfig().notifications.announcementsEnabled) {
      this.logger.log('Announcements are off (ANNOUNCEMENTS_ENABLED is false)');

      return;
    }

    this.firstRun = setTimeout(() => void this.run(), FIRST_RUN_DELAY_MS);
    this.firstRun.unref?.();
  }

  public onModuleDestroy(): void {
    clearTimeout(this.firstRun);
  }

  /** Both arguments are there for the spec, which sends its own list at its own instant. */
  public async run(
    announcements: readonly Announcement[] = ANNOUNCEMENTS,
    now: Date = new Date(),
  ): Promise<void> {
    const problems = announcementProblems(announcements);

    if (problems.length > 0) {
      this.logger.error(`Sending no announcements until these are fixed:\n${problems.join('\n')}`);

      return;
    }

    for (const announcement of announcements) {
      try {
        if (!(await this.announce(announcement, now))) {
          return;
        }
      } catch (error) {
        this.logger.error(`Announcement ${announcement.id} stopped: ${describe(error)}`);

        return;
      }
    }
  }

  /** Whether everybody it was meant for has now had their try at it. */
  private async announce(announcement: Announcement, now: Date): Promise<boolean> {
    const run = await this.store.start(announcement.id, now);

    if (run.completed) {
      return true;
    }

    const userIds = await this.linkReadService.readUserIdsLinkedBy(run.startedAt);
    const tally = new Map<AnnouncementOutcome, number>();

    await pool(userIds, CONCURRENCY, async (userId) => {
      const outcome = await this.deliver(announcement, userId);
      tally.set(outcome, (tally.get(outcome) ?? 0) + 1);
    });

    const summary = [...tally].map(([outcome, count]) => `${count} ${outcome}`).join(', ');
    this.logger.log(`Announcement ${announcement.id}: ${summary || 'nobody to send to'}`);

    // Left open, so the next start comes back for whoever this code threw on.
    if (tally.has('errored')) {
      return false;
    }

    await this.store.complete(announcement.id, new Date());

    return true;
  }

  /** Never throws: pool's workers must not, or the rest keep sending behind a rejected run. */
  private async deliver(announcement: Announcement, userId: string): Promise<AnnouncementOutcome> {
    try {
      if (!(await this.store.claim(announcement.id, userId))) {
        return 'claimed_already';
      }

      const outcome = await this.deliveryService.deliverAnnouncement(userId, announcement);
      await this.store.record(announcement.id, userId, outcome);

      return outcome;
    } catch (error) {
      this.logger.error(
        `Failed to send announcement ${announcement.id} to user ${userId}: ${describe(error)}`,
      );

      return 'errored';
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
