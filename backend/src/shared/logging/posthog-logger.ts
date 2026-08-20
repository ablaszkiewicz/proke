import { ConsoleLogger, Injectable, LogLevel, OnApplicationShutdown } from '@nestjs/common';
import { Logger as OtelLogger, SeverityNumber } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { getEnvConfig, isAnalyticsConfigured } from '../configs/env-configs';

/**
 * How PostHog spells what Nest calls a level. OTel wants both the number and the text; the
 * text is what the Logs UI filters on.
 */
const SEVERITY: Record<LogLevel, { severityNumber: SeverityNumber; severityText: string }> = {
  verbose: { severityNumber: SeverityNumber.TRACE, severityText: 'trace' },
  debug: { severityNumber: SeverityNumber.DEBUG, severityText: 'debug' },
  log: { severityNumber: SeverityNumber.INFO, severityText: 'info' },
  warn: { severityNumber: SeverityNumber.WARN, severityText: 'warn' },
  error: { severityNumber: SeverityNumber.ERROR, severityText: 'error' },
  fatal: { severityNumber: SeverityNumber.FATAL, severityText: 'fatal' },
};

/**
 * The console logger everything already writes to, with a copy of every line shipped to
 * PostHog Logs over OTLP.
 *
 * It hooks printMessages rather than the public methods because that is the one point every
 * level funnels through *after* ConsoleLogger has done the parsing - context peeled off the
 * argument list, stack separated from message, level filtering applied. Re-deriving any of
 * that out here would be a second copy of Nest's own heuristics, wrong the day they change.
 *
 * Keyed off the same POSTHOG_API_KEY as AnalyticsService, and off with it: local runs and the
 * e2e suite have no key and should be making no network calls. The console half keeps working
 * either way - PostHog is a copy of the log, never the log itself.
 *
 * Shipping is batched in-process and flushed on shutdown, for the same reason AnalyticsService
 * flushes: a redeploy ends with SIGTERM, and the lines lost with the batch would be exactly
 * the ones from the moment somebody will want to read about.
 */
@Injectable()
export class PosthogLogger extends ConsoleLogger implements OnApplicationShutdown {
  /** Both null when POSTHOG_API_KEY is unset - an ordinary state, not a broken one. */
  private readonly provider: LoggerProvider | null;
  private readonly otel: OtelLogger | null;

  constructor() {
    super();

    if (!isAnalyticsConfigured()) {
      this.provider = null;
      this.otel = null;
      return;
    }

    const { apiKey, host } = getEnvConfig().posthog;

    this.provider = new LoggerProvider({
      resource: resourceFromAttributes({ 'service.name': 'proke-backend' }),
      processors: [
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            // The same host analytics events go to; logs have their own path on it.
            url: `${host}/i/v1/logs`,
            headers: { Authorization: `Bearer ${apiKey}` },
          }),
        }),
      ],
    });
    this.otel = this.provider.getLogger('proke-backend');
  }

  protected printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ): void {
    super.printMessages(messages, context, logLevel, writeStreamType, errorStack);

    if (!this.otel) {
      return;
    }

    // One record per message, mirroring the one-line-each the console prints. Nothing in here
    // may throw past this method: a poke must never fail because its log line could not.
    try {
      for (const message of messages) {
        this.otel.emit({
          ...SEVERITY[logLevel ?? 'log'],
          body: render(message),
          attributes: {
            // The Nest context - which service said it. The property to filter on.
            ...(context ? { context } : {}),
            // Same property analytics puts on every event, so a developer pointed at the real
            // project stays distinguishable in Logs the way they already are in events.
            environment: process.env.NODE_ENV ?? 'development',
            ...(errorStack ? { 'exception.stacktrace': String(errorStack) } : {}),
          },
        });
      }
    } catch {
      // Deliberately silent: reporting a logging failure through the logger is a loop.
    }
  }

  /**
   * Flushes what is still batched. main.ts calls enableShutdownHooks() and provides this class
   * through the injector, which is what makes Nest call this on SIGTERM.
   */
  public async onApplicationShutdown(): Promise<void> {
    await this.provider?.shutdown();
  }
}

/**
 * A body PostHog can index. Strings pass through untouched - which is every line this codebase
 * writes today - and anything else becomes JSON rather than "[object Object]".
 */
function render(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }

  if (message instanceof Error) {
    return message.stack ?? message.message;
  }

  try {
    return JSON.stringify(message) ?? String(message);
  } catch {
    return String(message);
  }
}
