import { GithubEndpoint } from '../../analytics/metrics-catalog';
import { MetricsService } from '../../analytics/metrics.service';

/**
 * `fetch`, timed.
 *
 * Eleven places in this codebase call api.github.com and none of them could be seen. That
 * matters more here than it would in most apps, because of how consistently they fail: every one
 * of these calls answers `null` on a bad status rather than throwing, and every one of those
 * nulls turns into a poke somebody quietly does not get. A revoked token, a 403 from a missing
 * org permission, a rate limit - all three look identical from the outside, which is to say they
 * look like nothing at all.
 *
 * One histogram covers all of it. A histogram carries its own count, so `endpoint` and `status`
 * together give call volume, latency and error rate without three separate metrics.
 *
 * ## Why a function taking the service, rather than an injectable wrapper
 *
 * A GithubHttpService would be the tidier-looking answer and would mean a new shared module
 * imported by four feature modules, plus a constructor change in ten classes that already have
 * the dependencies they need. This is the same instrumentation with one import: MetricsService
 * comes from the global AnalyticsModule, so every caller can already reach it.
 *
 * The endpoint label is passed rather than derived from the URL, deliberately. Every URL here
 * carries an owner, a repository, an installation or a comment id, and any derivation clever
 * enough to strip those is one GitHub API change away from letting one through - at which point
 * the series budget goes to a repository nobody will ever chart.
 */
export async function githubFetch(
  metrics: MetricsService,
  endpoint: GithubEndpoint,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const startedAt = Date.now();

  try {
    const response = await fetch(url, init);

    metrics.duration('proke.github.request.duration', Date.now() - startedAt, {
      endpoint,
      status: String(response.status),
    });

    return response;
  } catch (error) {
    // GitHub unreachable, DNS, a socket closed mid-flight. Recorded as its own status rather
    // than left out, because "we never got an answer" is the failure mode every caller here
    // handles by dropping a poke, and it should not be invisible just because it has no code.
    metrics.duration('proke.github.request.duration', Date.now() - startedAt, {
      endpoint,
      status: 'error',
    });

    throw error;
  }
}
