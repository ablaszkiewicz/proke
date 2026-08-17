import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { PostHog } from 'posthog-node';
import { getEnvConfig, isAnalyticsConfigured } from '../shared/configs/env-configs';
import { AnalyticsEvent } from './analytics-events';

/** The one place the prefix is written down. Every backend event gets it, without exception. */
const EVENT_PREFIX = 'backend_';

/**
 * Everything proke tells PostHog from the server.
 *
 * Two rules hold this together:
 *
 * `distinctId` is required on every method. The NestJS interceptor in main.ts reads a distinct
 * id out of an incoming `x-posthog-distinct-id` header, which is *client-controlled* - anybody
 * can send any value. PostHog gives an explicit distinct id precedence over that context, so
 * demanding one here means no event can ever be attributed to a person on the strength of a
 * header. The header is left to do the one thing it is trusted for: carrying `$session_id`, so
 * a backend event lands on the same session replay as the click that caused it.
 *
 * Nothing in here throws or blocks. Capture queues in memory and flushes on a timer, and the
 * catch below is the backstop: a poke must never fail because analytics did.
 */
@Injectable()
export class AnalyticsService implements OnApplicationShutdown {
  private readonly logger = new Logger(AnalyticsService.name);

  /** Null when POSTHOG_API_KEY is unset. An ordinary state - local runs and CI have no key. */
  private readonly posthog: PostHog | null;

  constructor() {
    if (!isAnalyticsConfigured()) {
      this.posthog = null;
      return;
    }

    const { apiKey, host } = getEnvConfig().posthog;

    this.posthog = new PostHog(apiKey, { host });

    // The SDK swallows its own failures by design so it cannot take the process down with it.
    // That also means a wrong key or a blocked egress is invisible without this.
    this.posthog.on('error', (error) => {
      this.logger.warn(`PostHog: ${error}`);
    });
  }

  /** The same instance main.ts hands to PostHogInterceptor, so both share one queue. */
  public get client(): PostHog | null {
    return this.posthog;
  }

  /** An event about a known proke user. `distinctId` is always their `user.id`. */
  public capture(
    distinctId: string,
    event: AnalyticsEvent,
    properties: Record<string, unknown> = {},
  ): void {
    this.send(distinctId, event, properties);
  }

  /**
   * An event with no proke user behind it.
   *
   * Webhooks arrive for whole organisations, most of whose members have never signed up, so
   * "installed by somebody we have never seen" is the common case rather than an error. These
   * still matter as counts, but minting a person profile for every GitHub account that touches
   * an installation would fill the project with people who are not users.
   *
   * `distinctId` is still required - PostHog needs one on every event - but it is a grouping
   * key here rather than an identity: a GitHub account id, a Slack team id.
   */
  public captureWithoutPerson(
    distinctId: string,
    event: AnalyticsEvent,
    properties: Record<string, unknown> = {},
  ): void {
    this.send(distinctId, event, { ...properties, $process_person_profile: false });
  }

  /**
   * Person properties for a known user. Called at login, which is the one moment the server
   * has all of them fresh from GitHub.
   */
  public identify(
    distinctId: string,
    properties: Record<string, unknown>,
    propertiesOnce: Record<string, unknown> = {},
  ): void {
    if (!this.posthog) {
      return;
    }

    try {
      this.posthog.identify({
        distinctId,
        properties: { ...properties, $set_once: propertiesOnce },
      });
    } catch (error) {
      this.logger.warn(`Could not identify ${distinctId}: ${error}`);
    }
  }

  /**
   * Flushes what is still queued.
   *
   * main.ts calls enableShutdownHooks(), so this runs on SIGTERM - which is how a redeploy
   * ends. Without it every event captured inside the last flush interval dies with the
   * container, and the events lost are exactly the ones from the busiest moment.
   */
  public async onApplicationShutdown(): Promise<void> {
    await this.posthog?.shutdown();
  }

  private send(
    distinctId: string,
    event: AnalyticsEvent,
    properties: Record<string, unknown>,
  ): void {
    if (!this.posthog) {
      return;
    }

    try {
      this.posthog.capture({
        distinctId,
        event: `${EVENT_PREFIX}${event}`,
        properties: {
          // So a developer running against the real project cannot quietly poison production
          // numbers. Cheap enough to put on everything rather than remember to filter later.
          environment: process.env.NODE_ENV ?? 'development',
          ...properties,
        },
      });
    } catch (error) {
      this.logger.warn(`Could not capture ${event}: ${error}`);
    }
  }
}
