import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { MetricsService } from '../../analytics/metrics.service';
import { getEnvConfig } from '../../shared/configs/env-configs';
import { UserReadService } from '../../user/read/user-read.service';
import { InboxRefreshService } from '../inbox-refresh.service';
import { InboxWarmReadService, UserWarmPins } from './read/inbox-warm-read.service';

/**
 * How long after boot the first sweep runs.
 *
 * There is one at all because without it a deploy leaves every warm view cold for a whole
 * interval - and the first load after a deploy is precisely the case this feature exists to fix.
 * The snapshots live in this process, so they go with it.
 *
 * Twenty seconds because a container that has just started is answering its first requests,
 * opening its first Mongo connections and being health-checked, and firing every GitHub query
 * proke owes into that is a self-inflicted cold start.
 */
const FIRST_SWEEP_DELAY_MS = 20_000;

/**
 * How many users are refreshed at once.
 *
 * Across users rather than within one: a person's pins go one after another, so the teammate
 * lookup the first one does is a cache hit for the rest, and nobody with three pins takes three
 * slots while somebody with one waits.
 *
 * Four because the ceiling on this is not GitHub - each query is against the user's own
 * 5,000-an-hour budget - it is this process. Every refresh parses a large GraphQL response and
 * classifies it, which is synchronous work on the same event loop serving webhooks, and
 * `proke.event_loop.delay` is the metric that would show it going wrong.
 */
const CONCURRENCY = 4;

/**
 * How recently somebody must have used proke for their pins to be swept.
 *
 * Without a gate the sweep only ever grows: three pins belonging to somebody who signed up once
 * and left cost 36 GitHub queries an hour, for ever, on behalf of nobody. `lastActivityDate` is
 * stamped by the auth guard on every authenticated request, so this tracks genuine use.
 *
 * Forty-eight hours covers a working week and deliberately not a weekend - somebody who stops on
 * Friday evening and returns on Monday morning arrives to a cold inbox, which costs them about a
 * second and a half once. A pin is not forgotten while they are away, only left unswept, so the
 * first request they make warms it again for the next two days.
 */
const ACTIVE_WITHIN_MS = 48 * 60 * 60_000;

/**
 * Rebuilds the views people have asked to be kept ready, on a timer.
 *
 * ## What it is and is not
 *
 * It calls `InboxRefreshService.refresh` and nothing else - the same code path the endpoint
 * takes, with a timer for a trigger instead of a request. Which is why that service was written
 * as the only thing in the module that talks to GitHub: there is no second implementation of an
 * inbox here to drift from the first.
 *
 * It does not make the client's own refresh unnecessary, and is not meant to. The page still
 * asks GitHub behind rows that are already on screen. What this buys is that the rows are
 * *there* for the first frame - after a deploy, after a night away, and under a set of filters
 * somebody uses rarely, which are the three cases where today they are not.
 *
 * ## Why a plain timer, and why no leader election
 *
 * A timer because two services in this codebase already do exactly this and a dependency for one
 * `setInterval` is not worth its own line in the lockfile. `unref`, like both of them, or the
 * timer alone keeps the process - and every jest run - alive.
 *
 * No leader election because the thing being warmed is a cache inside this process. A second
 * replica warming its own is correct rather than duplicated work; there is nothing shared to
 * coordinate over. The cost is that GitHub calls multiply by replica count, which is worth
 * knowing before scaling out and is not a reason to coordinate.
 *
 * ## What it is careful about
 *
 * A sweep that overruns its interval must not have another started on top of it, so there is a
 * re-entrancy guard and a counter that says when it fires. And nothing may throw out of the
 * timer callback: an unhandled rejection there takes the process down, and a warm cache is never
 * worth that.
 */
@Injectable()
export class InboxWarmerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(InboxWarmerService.name);
  private firstSweep?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(
    private readonly warmReadService: InboxWarmReadService,
    private readonly userReadService: UserReadService,
    private readonly inboxRefreshService: InboxRefreshService,
    private readonly metrics: MetricsService,
  ) {}

  public onApplicationBootstrap(): void {
    const intervalMs = getEnvConfig().inbox.warmSweepIntervalMs;

    // Nought is off, which is what the e2e suite wants: a timer reaching for GitHub in the
    // background would make every spec's mocks a race. Specs call `sweep` directly instead.
    if (intervalMs <= 0) {
      this.logger.log('Inbox warming is off (INBOX_WARM_SWEEP_INTERVAL_MS is 0)');
      return;
    }

    this.firstSweep = setTimeout(() => void this.sweep(), FIRST_SWEEP_DELAY_MS);
    this.firstSweep.unref?.();

    this.timer = setInterval(() => void this.sweep(), intervalMs);
    this.timer.unref?.();

    this.logger.log(`Inbox warming every ${Math.round(intervalMs / 1000)}s`);
  }

  public onModuleDestroy(): void {
    clearTimeout(this.firstSweep);
    clearInterval(this.timer);
  }

  /**
   * One pass over everybody's pins.
   *
   * Public so a spec can drive it without a timer, and so the shape under test is the shape that
   * ships. It resolves rather than rejects whatever happens inside it - see the note above.
   */
  public async sweep(): Promise<void> {
    if (this.sweeping) {
      // Worth counting rather than only logging: a sweep that cannot finish inside its own
      // interval is the failure mode this feature has, and it is invisible in a duration chart
      // because the overrunning sweep is the one that never records.
      this.metrics.count('proke.inbox.warm.sweeps', { outcome: 'overlapped' });
      this.logger.warn('Skipping an inbox warm sweep: the previous one is still running');

      return;
    }

    this.sweeping = true;
    const startedAt = Date.now();

    try {
      await this.run();
      this.metrics.count('proke.inbox.warm.sweeps', { outcome: 'completed' });
    } catch (error) {
      this.metrics.count('proke.inbox.warm.sweeps', { outcome: 'failed' });
      this.logger.error(`Inbox warm sweep failed: ${describe(error)}`);
    } finally {
      this.sweeping = false;
      this.metrics.duration('proke.inbox.warm.duration', Date.now() - startedAt, {});
    }
  }

  private async run(): Promise<void> {
    const everybody = await this.warmReadService.readAll();

    if (everybody.length === 0) {
      return;
    }

    /*
     * Which of them have been here lately and still have a token, decided by Mongo rather than
     * here. A projection of ids costs nothing and, more to the point, decrypts nothing: reading
     * the users themselves would run every stored GitHub token through the cipher to answer a
     * question about a date.
     */
    const eligible = new Set(
      await this.userReadService.readRefreshableIds(
        everybody.map((entry) => entry.userId),
        new Date(Date.now() - ACTIVE_WITHIN_MS),
      ),
    );

    const due: UserWarmPins[] = [];

    for (const entry of everybody) {
      if (eligible.has(entry.userId)) {
        due.push(entry);
        continue;
      }

      // Counted per pin rather than per person, so this series and the outcomes below are in the
      // same unit and can be read against each other.
      this.metrics.count('proke.inbox.warmed', { result: 'skipped_inactive' }, entry.pins.length);
    }

    await pool(due, CONCURRENCY, (entry) => this.warmUser(entry));
  }

  /** One person's pins, one after another, so the teammate lookup is shared between them. */
  private async warmUser(entry: UserWarmPins): Promise<void> {
    for (const pin of entry.pins) {
      try {
        const result = await this.inboxRefreshService.refresh(entry.userId, pin.filters);

        this.metrics.count('proke.inbox.warmed', {
          result: result.ok
            ? 'refreshed'
            : result.reason === 'no-token'
              ? 'no_token'
              : 'github_unavailable',
        });

        // A revoked token stops the rest of this person's pins immediately: refresh has already
        // cleared it, so every remaining one would take the same trip to Mongo to be told the
        // same thing, and the next sweep will not see them at all.
        if (!result.ok && result.reason === 'no-token') {
          return;
        }
      } catch (error) {
        // One person's inbox failing must not end the sweep for everybody behind them in the
        // pool. Logged rather than swallowed silently, because this is the branch that means a
        // bug rather than GitHub being GitHub - `refresh` handles that itself and returns.
        this.metrics.count('proke.inbox.warmed', { result: 'failed' });
        this.logger.error(`Failed to warm ${pin.key} for user ${entry.userId}: ${describe(error)}`);
      }
    }
  }
}

/**
 * Runs `work` over `items`, at most `limit` at a time.
 *
 * Workers pulling from a shared cursor rather than fixed slices, so one slow user delays the
 * next item and not a whole quarter of the list. Never rejects: `warmUser` handles its own
 * failures, and a pool that threw would take the sweep down with it.
 */
async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let index = next++; index < items.length; index = next++) {
      await work(items[index]);
    }
  });

  await Promise.all(workers);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
