import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../analytics/metrics.service';
import { InstallationNormalized } from '../installations/core/entities/installation.interface';
import { InstallationSerializer } from '../installations/core/entities/installation.serializer';
import { githubFetch } from '../shared/http/github-fetch';

const PER_PAGE = 100;
// A ceiling on the paging loop rather than a real limit. Ten pages is an account in a thousand
// installations, which nobody is; the point is that a malformed total_count cannot spin here.
const MAX_PAGES = 10;

/**
 * GitHub has refused the token we hold for this user - they revoked the authorization, or it
 * expired.
 *
 * Its own type because the only wrong answer is to let it surface as an HTTP 401. That is the
 * status the frontend reads as "your proke session is dead", so a user who revoked proke on
 * GitHub's side was being signed out of proke entirely, where their session was perfectly good.
 * Callers translate this into something that says which credential actually failed.
 */
export class GithubTokenRejectedError extends Error {
  constructor() {
    super('GitHub rejected the stored access token');
    this.name = 'GithubTokenRejectedError';
  }
}

/**
 * Installations the *authenticated user* can reach, per GitHub: "installations of your GitHub
 * App that the authenticated user has explicit permission to access", which includes ones
 * reached "through an organization membership".
 *
 * That is what lets a second member of an org see an installation a colleague created, without
 * either of them needing to enumerate orgs - which a GitHub App cannot do anyway.
 */
@Injectable()
export class GithubUserInstallationsDataService {
  private readonly logger = new Logger(GithubUserInstallationsDataService.name);

  constructor(private readonly metrics: MetricsService) {}

  /**
   * Every page, not just the first.
   *
   * This list is not only what the connections page renders - it is also the access check behind
   * subscribing and uninstalling. Stopping at one page did not merely truncate the view; it made
   * a legitimate subscribe to the hundred-and-first installation come back as "you do not have
   * access to that installation".
   */
  public async listForUser(accessToken: string): Promise<InstallationNormalized[]> {
    const installations: InstallationNormalized[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await this.readPage(accessToken, page);

      if (!Array.isArray(body?.installations)) {
        break;
      }

      installations.push(
        ...body.installations.map((installation: any) =>
          InstallationSerializer.fromGithubPayload(installation),
        ),
      );

      // A short page is the last page. total_count is checked too so a full final page does not
      // cost an extra empty request.
      if (
        body.installations.length < PER_PAGE ||
        installations.length >= Number(body.total_count ?? 0)
      ) {
        return installations;
      }
    }

    this.logger.warn(
      `Stopped paging /user/installations at ${MAX_PAGES} pages with ${installations.length} results`,
    );

    return installations;
  }

  private async readPage(accessToken: string, page: number): Promise<any> {
    const response = await githubFetch(
      this.metrics,
      'user_installations',
      `https://api.github.com/user/installations?per_page=${PER_PAGE}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (response.status === 401) {
      throw new GithubTokenRejectedError();
    }

    if (!response.ok) {
      this.logger.warn(`GET /user/installations page ${page} responded ${response.status}`);
      return null;
    }

    return response.json();
  }
}
