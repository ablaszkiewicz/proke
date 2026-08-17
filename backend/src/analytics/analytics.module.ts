import { Global, Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

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
 */
@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
