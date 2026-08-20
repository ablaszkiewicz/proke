import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PostHogInterceptor } from 'posthog-node/nestjs';
import { AnalyticsService } from './analytics/analytics.service';
import { AppModule } from './app.module';
import {
  assertProductionEnv,
  getEnvConfig,
  isAnalyticsConfigured,
} from './shared/configs/env-configs';
import { PosthogLogger } from './shared/logging/posthog-logger';
import { buildValidationPipe } from './shared/validation/validation-pipe';

async function bootstrap() {
  // Before anything is built, so a missing secret is a refusal to start rather than a running
  // server quietly using a fallback that is published in this repository.
  assertProductionEnv();

  // rawBody keeps the exact bytes GitHub signed. Re-serializing the parsed JSON changes key
  // order and whitespace, which changes the HMAC, so webhook verification needs the original.
  //
  // bufferLogs holds Nest's own bootstrap lines until useLogger below swaps in the logger that
  // also ships to PostHog, so startup is in the log too. A boot that dies before then still
  // prints: Nest's exceptions zone flushes the buffer through the default logger.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  // From here on, every `new Logger(...)` in the codebase writes to the console as before and
  // is copied to PostHog Logs - one logger, resolved through the injector so shutdown flushes it.
  app.useLogger(app.get(PosthogLogger));

  // Express defaults to 100kb, and an ordinary GitHub `pull_request` delivery is bigger than
  // that: the repository object appears three times (top level, head.repo, base.repo), plus
  // installation, sender, organization and the whole PR body. Those deliveries were getting a
  // 413, which GitHub records as failed and never retries, so the poke was silently lost.
  // useBodyParser replaces Nest's default json parser but keeps the rawBody verify hook, so
  // webhook HMAC verification still sees the exact bytes GitHub signed.
  app.useBodyParser('json', { limit: '1mb' });

  app.enableShutdownHooks();
  app.enableCors({ origin: '*' });

  const config = new DocumentBuilder().addBearerAuth().setTitle('Proke').build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documentFactory, { customSiteTitle: 'Proke API Documentation' });

  app.useGlobalPipes(buildValidationPipe());

  installAnalyticsInterceptors(app);

  await app.init();
  await app.listen(getEnvConfig().app.port);
}

/**
 * Ties every event captured during a request back to the browser session that made it.
 *
 * posthog-js is configured with `tracing_headers` for this host, so requests from the frontend
 * arrive carrying `x-posthog-session-id`. The interceptor puts it - along with the URL, method,
 * path, user agent and client IP - into an AsyncLocalStorage context for the life of the
 * request, which means a `backend_org_subscribed` can be opened straight into the session
 * replay of the click that caused it.
 *
 * It also reads a distinct id from the headers, which is forgeable. AnalyticsService requires
 * an explicit one on every call for exactly that reason, and PostHog prefers the explicit
 * value, so the header never decides who an event belongs to.
 *
 * Exception capture is left off (the default). Error tracking is a separate decision from
 * product analytics and should be turned on deliberately, not inherited from this.
 */
function installAnalyticsInterceptors(app: Awaited<ReturnType<typeof NestFactory.create>>): void {
  const logger = new Logger('Analytics');

  if (!isAnalyticsConfigured()) {
    // Loud in production, silent everywhere else: locally and in the e2e suite having no key
    // is the intended state, but on a deployed box it means events are going nowhere and the
    // only symptom is an empty dashboard nobody thinks to distrust.
    if (process.env.NODE_ENV === 'production') {
      logger.warn('POSTHOG_API_KEY is not set - no analytics, logs or metrics will be captured.');
    }

    return;
  }

  const client = app.get(AnalyticsService).client;

  if (client) {
    app.useGlobalInterceptors(new PostHogInterceptor(client));
  }
}
bootstrap();

process.on('uncaughtException', (error) => {
  console.error(error);
});

process.on('unhandledRejection', (error) => {
  console.error(error);
});
