import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../../analytics/metrics.service';
import { InMemoryCacheService } from '../../shared/cache/in-memory-cache.service';
import { githubFetch } from '../../shared/http/github-fetch';
import { UserNormalized } from '../../user/core/entities/user.interface';

/**
 * Long enough that a busy thread costs one call rather than one per comment, short enough that
 * access granted or revoked this morning is right again by lunchtime. Both directions of being
 * wrong are mild and self-correcting; neither is worth asking GitHub on every event.
 */
const ANSWER_TTL_MS = 5 * 60_000;

/**
 * Whether a particular person can see a particular repository - asked with *their* token, which
 * is the only credential that answers about them.
 *
 * The app's own token cannot: it can read every repository the installation covers, which is
 * exactly the set this question needs narrowing down from. Asking as the user makes GitHub's
 * own answer ours, teams and org base permissions and outside collaborators included, with no
 * permission model to reimplement here.
 */
@Injectable()
export class GithubRepositoryAccessDataService {
  private readonly logger = new Logger(GithubRepositoryAccessDataService.name);

  constructor(
    private readonly cache: InMemoryCacheService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * True yes, false no, null "could not establish" - and callers must treat that third one as a
   * refusal rather than as a yes. It covers a revoked token, a rate limit and GitHub being down,
   * none of which are evidence that somebody is allowed to read a private repository.
   *
   * Null is deliberately not cached, so a blip costs one dropped poke rather than five minutes
   * of them.
   */
  public async canAccess(
    user: UserNormalized,
    repositoryFullName: string,
  ): Promise<boolean | null> {
    if (!user.githubAccessToken) {
      // Signed in before proke asked for GitHub authorization, or revoked it since. The
      // dashboard already tells them to reconnect; here it just means we cannot vouch for them.
      return null;
    }

    const accessToken = user.githubAccessToken;

    return this.cache.wrap<boolean | null>(
      `github:repo-access:${user.id}:${repositoryFullName.toLowerCase()}`,
      (answer) => (answer === null ? 0 : ANSWER_TTL_MS),
      () => this.read(accessToken, repositoryFullName),
    );
  }

  private async read(accessToken: string, repositoryFullName: string): Promise<boolean | null> {
    const [owner, name, ...rest] = repositoryFullName.split('/');

    if (!owner || !name || rest.length > 0) {
      this.logger.warn(`Cannot ask about a repository named "${repositoryFullName}"`);
      return null;
    }

    let response: Response;

    try {
      response = await githubFetch(
        this.metrics,
        'repo',
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
    } catch (error) {
      this.logger.warn(`Could not reach GitHub about ${repositoryFullName}: ${error}`);
      return null;
    }

    if (response.status === 200) {
      return true;
    }

    // GitHub answers 404 rather than 403 for a private repository you may not see - telling the
    // two apart would itself leak which private repositories exist.
    if (response.status === 404) {
      return false;
    }

    this.logger.warn(`Could not establish access to ${repositoryFullName} (${response.status})`);

    return null;
  }
}
