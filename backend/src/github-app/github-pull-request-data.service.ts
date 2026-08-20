import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../analytics/metrics.service';
import { GithubDiffStat } from '../notifications/core/entities/github-notification.interface';
import { InMemoryCacheService } from '../shared/cache/in-memory-cache.service';
import { githubFetch } from '../shared/http/github-fetch';
import { GithubAppTokenService } from './github-app-token.service';

/**
 * Long enough that a review thread costs one call rather than one per comment, short enough that
 * somebody pushing mid-thread is not misreported for long. Being a few minutes stale about a
 * line count is mild; asking GitHub about every comment is not.
 */
const DIFF_TTL_MS = 5 * 60_000;
/** Short, because unresolvable covers a transient 500 as well as a pull request we cannot read. */
const UNRESOLVED_TTL_MS = 60_000;

/**
 * How big a pull request is.
 *
 * Only `pull_request` events carry the line counts in their payload; a review, a review comment
 * and a conversation comment all arrive with the cut-down pull request object that leaves them
 * out. Since the same pull request should not look different depending on which event poked you,
 * the missing ones are fetched.
 *
 * Keyed on the pull request rather than the installation - how big a change is, is a fact about
 * the change - so a burst of comments on one thread costs a single call.
 */
@Injectable()
export class GithubPullRequestDataService {
  private readonly logger = new Logger(GithubPullRequestDataService.name);

  constructor(
    private readonly tokenService: GithubAppTokenService,
    private readonly cache: InMemoryCacheService,
    private readonly metrics: MetricsService,
  ) {}

  /** Null where we could not establish it. Never zero: callers must not show it as an empty diff. */
  public async readDiff(
    installationId: string,
    owner: string,
    name: string,
    number: number,
  ): Promise<GithubDiffStat | null> {
    return this.cache.wrap<GithubDiffStat | null>(
      `github:pr-diff:${owner.toLowerCase()}/${name.toLowerCase()}#${number}`,
      (diff) => (diff ? DIFF_TTL_MS : UNRESOLVED_TTL_MS),
      () => this.read(installationId, owner, name, number),
    );
  }

  private async read(
    installationId: string,
    owner: string,
    name: string,
    number: number,
  ): Promise<GithubDiffStat | null> {
    const token = await this.tokenService.read(installationId);

    if (!token) {
      return null;
    }

    let response: Response;

    try {
      response = await githubFetch(
        this.metrics,
        'pull_request',
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}` +
          `/pulls/${encodeURIComponent(number)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
    } catch (error) {
      this.logger.warn(`Could not reach GitHub about ${owner}/${name}#${number}: ${error}`);
      return null;
    }

    if (!response.ok) {
      this.logger.debug(`No diff for ${owner}/${name}#${number} (${response.status})`);
      return null;
    }

    const body = await response.json();

    // A pull request always reports both, so one missing means we are not looking at what we
    // think we are - and a poke reading "+0/-0" would be a confident lie about the change.
    if (!Number.isFinite(body?.additions) || !Number.isFinite(body?.deletions)) {
      this.logger.warn(`Unexpected pull request payload for ${owner}/${name}#${number}`);
      return null;
    }

    return { additions: body.additions, deletions: body.deletions };
  }
}
