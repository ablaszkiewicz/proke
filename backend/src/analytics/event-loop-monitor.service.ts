import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { IntervalHistogram, monitorEventLoopDelay } from 'node:perf_hooks';
import { isAnalyticsConfigured } from '../shared/configs/env-configs';
import { MetricsService } from './metrics.service';

/**
 * How often Node samples the loop. Every reading below is built from these, so it is the floor
 * on what any of them can resolve; 20ms is fine enough to see a stall and coarse enough that the
 * sampling itself is not the load.
 */
const RESOLUTION_MS = 20;

/**
 * One reading per flush window. Emitting more often would be writing over the same series
 * several times before it is sent, since a gauge keeps only the last value in a window.
 */
const SAMPLE_INTERVAL_MS = 10_000;

const NANOS_PER_MS = 1e6;

/**
 * How far behind the event loop is running.
 *
 * The one gauge in the set, and it earns the place because of a decision made in the webhook
 * controller: GitHub gives up on a delivery after ten seconds, so proke acknowledges immediately
 * and does the real work detached, unawaited. That is the right trade and it has a cost - the
 * work still has to happen, and nothing downstream of that `void` can push back on how fast
 * deliveries arrive.
 *
 * So proke has no queue to measure the depth of. Backpressure has exactly one place to surface,
 * and this is it: when routing starts taking longer than deliveries arrive, the loop falls
 * behind before any poke is late enough for anybody to notice. Every other metric in the set
 * would show the symptom afterwards; this one shows the cause while it is still building.
 *
 * Three readings rather than one. The mean says how loaded the process is over the window; p99
 * is where a single blocking stretch shows up at all, and a mean that looks healthy hides those
 * completely. p50 sits between them mostly so that "the whole loop is slow" and "the loop is
 * fine apart from one stall" are two different shapes rather than one number moving.
 *
 * Off entirely without POSTHOG_API_KEY - the histogram is cheap but not free, and a local run
 * and the e2e suite should be doing neither the sampling nor the timer.
 */
@Injectable()
export class EventLoopMonitorService implements OnApplicationBootstrap, OnApplicationShutdown {
  /** Both null when analytics is unconfigured, which is an ordinary state rather than a broken one. */
  private histogram: IntervalHistogram | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly metrics: MetricsService) {}

  /**
   * Started once the app is up rather than in the constructor, so the readings describe a
   * process that is serving traffic. Nest builds the injector eagerly and module construction is
   * itself a burst of synchronous work; measuring that would put a spike at the start of every
   * deploy that means nothing.
   */
  public onApplicationBootstrap(): void {
    if (!isAnalyticsConfigured()) {
      return;
    }

    this.histogram = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
    this.histogram.enable();

    this.timer = setInterval(() => this.sample(), SAMPLE_INTERVAL_MS);
    // Or the timer alone keeps the process - and every jest run - alive.
    this.timer.unref?.();
  }

  public onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.histogram?.disable();
    this.histogram = null;
  }

  /**
   * Reads the window and starts a new one.
   *
   * The reset is what makes each reading describe the last ten seconds rather than the whole
   * uptime. Without it a stall during startup would still be sitting in p99 a week later, and
   * the gauge would flatten into a line that never moves.
   */
  private sample(): void {
    const histogram = this.histogram;

    if (!histogram) {
      return;
    }

    // NaN until the first sample lands, which is the state on the very first tick after a
    // restart. MetricsService drops non-finite values anyway; returning here is just clearer
    // about the fact that there is nothing to say yet.
    if (!Number.isFinite(histogram.mean)) {
      return;
    }

    this.metrics.gauge('proke.event_loop.delay', toMilliseconds(histogram.mean), {
      quantile: 'mean',
    });
    this.metrics.gauge('proke.event_loop.delay', toMilliseconds(histogram.percentile(50)), {
      quantile: 'p50',
    });
    this.metrics.gauge('proke.event_loop.delay', toMilliseconds(histogram.percentile(99)), {
      quantile: 'p99',
    });

    histogram.reset();
  }
}

/** Node reports the delay in nanoseconds; every other duration proke records is in milliseconds. */
function toMilliseconds(nanoseconds: number): number {
  return nanoseconds / NANOS_PER_MS;
}
