import { Injectable, MiddlewareConsumer, Module, NestMiddleware, NestModule } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from '../../analytics/metrics.service';

/**
 * How long every request took, by route rather than by URL.
 *
 * `http.server.duration` is OpenTelemetry's own name for this, kept unprefixed on purpose: it is
 * the one metric here that means the same thing in every service that has ever emitted it, and
 * charting proke against anything else should not need a rename first.
 *
 * ## The route, not the URL
 *
 * `req.route.path` is Express's templated path - `/connections/:installationId/subscription` -
 * which is what makes this metric affordable. `req.originalUrl` is the same string with a real
 * installation id in it, and using it would mint a series per organisation, per route, forever.
 * Twelve routes and the handful of statuses proke returns is about thirty series; the same
 * metric keyed on URLs has no ceiling at all.
 *
 * ## Why middleware, and why the reading happens on `finish`
 *
 * Middleware rather than an interceptor because of Nest's order: middleware, then guards, then
 * interceptors. An interceptor never runs for a request a guard rejected, so every 401 from
 * AuthGuard - which is most of what an auth problem looks like from outside - would simply be
 * absent from the metric rather than visible as a spike. Middleware sees those, and sees
 * requests that matched no route at all.
 *
 * That ordering is also why nothing is read until the response is done. In middleware `req.route`
 * has not been matched yet, and the status is whatever the framework defaults to; by `finish`
 * both are settled - the route Express invoked, the status an exception filter or `@HttpCode`
 * finally wrote. The webhook controller's `@HttpCode(202)` is the case that makes this concrete:
 * it is applied when Nest writes the response, so anything reading earlier records the busiest
 * endpoint in the app as a 200 forever.
 *
 * An aborted connection never fires `finish` and so is never recorded. That is the right trade:
 * a client that hung up has no status worth attributing, and listening for `close` as well would
 * mean recording most requests twice.
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  public use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();

    response.once('finish', () => {
      this.metrics.duration('http.server.duration', Date.now() - startedAt, {
        route: routeOf(request),
        method: request.method,
        status: String(response.statusCode),
      });
    });

    next();
  }
}

/**
 * Carries its own wiring, so that turning this on is one import rather than a `configure` block
 * copied into AppModule and then again into the e2e harness - which builds its module from the
 * feature modules rather than from AppModule, and is exactly where a second copy would rot.
 */
@Module({ providers: [HttpMetricsMiddleware] })
export class HttpMetricsModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');
  }
}

/**
 * The templated path this request matched.
 *
 * Read at `finish`, by which point Express has matched the route and set this - so it is the
 * pattern with `:installationId` in it rather than the id. `unmatched` covers a request that
 * reached no route at all, and is a constant rather than the path, because those are exactly
 * the requests carrying arbitrary strings.
 */
function routeOf(request: Request): string {
  const path = request.route?.path;

  return typeof path === 'string' && path.length > 0 ? path : 'unmatched';
}
