import { Global, Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { EventLoopMonitorService } from './event-loop-monitor.service';
import { MetricsService } from './metrics.service';

/**
 * The one global module in proke, and deliberately so.
 *
 * Everywhere else the explicit `imports` list is the point - it says what a module depends on
 * and keeps that honest. Analytics is the exception because it is a genuine cross-cutting
 * concern: seven feature modules capture events, and threading an import through each of them
 * would document nothing except that observability touches everything, which is already known.
 *
 * The cost of `@Global()` is that a provider appears without a matching import. The trade only
 * works because AnalyticsService holds no domain state and nothing branches on it, so it cannot
 * become a hidden dependency between two features.
 *
 * Note for whoever adds the next module: test/utils/bootstrap.ts builds its own testing module
 * from the feature modules rather than from AppModule, so this has to be listed there too.
 *
 * MetricsService lives here for the same reason and one more: it records through
 * AnalyticsService's PostHog client, so the two share a queue and a shutdown. Being global is
 * what lets the in-memory cache and ten GitHub call sites count things without any of them
 * gaining a module import.
 *
 * EventLoopMonitorService is provided but exported by nobody - nothing injects it. It exists to
 * be constructed, so that its lifecycle hooks run.
 */
@Global()
@Module({
  providers: [AnalyticsService, MetricsService, EventLoopMonitorService],
  exports: [AnalyticsService, MetricsService],
})
export class AnalyticsModule {}
