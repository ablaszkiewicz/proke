import { Injectable } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CounterName, GaugeName, HistogramName, MetricAttributeMap } from './metrics-catalog';

/**
 * Everything proke counts, as opposed to everything it tells PostHog about people.
 *
 * The split with AnalyticsService is the whole design, and it is not about which product the
 * data lands in. An event is about somebody: it carries a `distinctId`, it can name a repository
 * and a pull request, and one of them is worth keeping forever. A metric is about the process:
 * it carries no identity at all, every attribute value it holds is one more time series, and its
 * value is entirely in the shape of the curve rather than in any single point on it.
 *
 * So the two answer different questions and neither substitutes for the other. "Which orgs poke
 * the most?" is an event question. "How many pokes died at the access check this hour?" is a
 * metric question - and it is one nothing in proke could answer before, because the answer is a
 * count of things that deliberately produce no event.
 *
 * ## Why this rides on AnalyticsService's client
 *
 * One PostHog instance means one queue, one flush timer and one shutdown. main.ts already calls
 * enableShutdownHooks() and AnalyticsService already flushes on SIGTERM - and `posthog.shutdown()`
 * drains the open metrics window alongside the queued events, so a redeploy does not lose the
 * ten seconds of counts leading up to it. A second client would need all of that again.
 *
 * Null client when POSTHOG_API_KEY is unset, exactly as for events: local runs and the e2e suite
 * have no key and should be making no network calls. Every method below is then a no-op.
 *
 * ## Nothing in here throws
 *
 * The SDK swallows its own transport failures by design, and recording is fire-and-forget on top
 * of an in-memory aggregate. A poke must never fail because a counter did.
 */
@Injectable()
export class MetricsService {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * Adds to a counter. `value` is there for the bulk case - a bot comment suppressed for six
   * people is one call, not six - and counters are monotonic, so it may never be negative.
   */
  public count<N extends CounterName>(name: N, attributes: MetricAttributeMap[N], value = 1): void {
    if (value <= 0) {
      return;
    }

    this.analytics.client?.metrics.count(name, value, { attributes });
  }

  /** Records where a value stands right now. The window keeps the last one written. */
  public gauge<N extends GaugeName>(
    name: N,
    value: number,
    attributes: MetricAttributeMap[N],
  ): void {
    this.analytics.client?.metrics.gauge(name, value, { attributes });
  }

  /**
   * Records one duration in milliseconds.
   *
   * Named for what it measures rather than for its shape, because every histogram in this
   * codebase is a duration - so no call site has to remember to pass a unit, and none of them
   * can pass a different one and split a series in two.
   */
  public duration<N extends HistogramName>(
    name: N,
    milliseconds: number,
    attributes: MetricAttributeMap[N],
  ): void {
    // A clock that went backwards, or a start time nobody set. Dropping the sample keeps a
    // negative out of a distribution where it would be indistinguishable from a real reading.
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      return;
    }

    this.analytics.client?.metrics.histogram(name, milliseconds, { unit: 'ms', attributes });
  }
}
