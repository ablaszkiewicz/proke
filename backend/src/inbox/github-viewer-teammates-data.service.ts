import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../analytics/metrics.service';
import { InMemoryCacheService } from '../shared/cache/in-memory-cache.service';
import { githubFetch } from '../shared/http/github-fetch';

/**
 * Teams change on the order of weeks. Long enough that this is one pair of calls a session rather
 * than one per refresh, short enough that somebody who joined a team this morning is grouped
 * right by this afternoon.
 */
const TEAMMATES_TTL_MS = 30 * 60_000;
/** Short, because unresolvable covers a transient 500 as well as a missing permission. */
const UNRESOLVED_TTL_MS = 2 * 60_000;

/** A ceiling on the fan-out, not a real limit. Somebody in fifty teams is somebody, not everybody. */
const MAX_TEAMS = 25;
const PER_PAGE = 100;

/**
 * Everyone the viewer shares a GitHub team with.
 *
 * The one thing separating "your team" from "everyone else" on the inbox, and the only part of
 * building it that GitHub will not answer in the main query. Asked with the user's own token, so
 * the answer is about them rather than about the app - the same reason the repository access
 * check next door uses theirs.
 *
 * Needs the app's "Organization permissions -> Members: Read". Without it GitHub answers 403,
 * this returns null, and every human lands in "everyone else" - which is a worse grouping and a
 * perfectly usable inbox. Nothing here is allowed to fail the whole page.
 */
@Injectable()
export class GithubViewerTeammatesDataService {
  private readonly logger = new Logger(GithubViewerTeammatesDataService.name);

  constructor(
    private readonly cache: InMemoryCacheService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Lowercased logins, the viewer's own included. Null means "could not establish", which callers
   * must not read as "you have no teammates".
   */
  public async read(userId: string, accessToken: string): Promise<Set<string> | null> {
    const cached = await this.cache.wrap<string[] | null>(
      `github:teammates:${userId}`,
      (logins) => (logins ? TEAMMATES_TTL_MS : UNRESOLVED_TTL_MS),
      () => this.load(accessToken),
    );

    return cached ? new Set(cached) : null;
  }

  private async load(accessToken: string): Promise<string[] | null> {
    const teams = await this.readTeams(accessToken);

    if (!teams) {
      return null;
    }

    // Concurrently, and a team that cannot be read drops out rather than taking the rest with it.
    // A partial set of teammates still groups most of the inbox correctly.
    const memberships = await Promise.all(
      teams.slice(0, MAX_TEAMS).map((team) => this.readMembers(accessToken, team)),
    );

    const logins = new Set<string>();

    for (const members of memberships) {
      for (const login of members ?? []) {
        logins.add(login.toLowerCase());
      }
    }

    return [...logins];
  }

  private async readTeams(
    accessToken: string,
  ): Promise<{ org: string; slug: string }[] | null> {
    const body = await this.get(accessToken, 'user_teams', `https://api.github.com/user/teams?per_page=${PER_PAGE}`);

    if (!Array.isArray(body)) {
      return null;
    }

    return body
      .filter((team: any) => team?.slug && team?.organization?.login)
      .map((team: any) => ({ org: team.organization.login, slug: team.slug }));
  }

  private async readMembers(
    accessToken: string,
    team: { org: string; slug: string },
  ): Promise<string[] | null> {
    const body = await this.get(
      accessToken,
      'team_membership',
      `https://api.github.com/orgs/${encodeURIComponent(team.org)}` +
        `/teams/${encodeURIComponent(team.slug)}/members?per_page=${PER_PAGE}`,
    );

    if (!Array.isArray(body)) {
      return null;
    }

    return body.map((member: any) => member?.login).filter(Boolean);
  }

  private async get(
    accessToken: string,
    endpoint: 'user_teams' | 'team_membership',
    url: string,
  ): Promise<unknown> {
    let response: Response;

    try {
      response = await githubFetch(this.metrics, endpoint, url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch (error) {
      this.logger.warn(`Could not reach GitHub for ${endpoint}: ${error}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(
        `GET ${endpoint} responded ${response.status}. The app may be missing the ` +
          '"Members" organization permission.',
      );
      return null;
    }

    return response.json();
  }
}
