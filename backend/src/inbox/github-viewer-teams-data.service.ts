import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../analytics/metrics.service';
import { InMemoryCacheService } from '../shared/cache/in-memory-cache.service';
import { githubFetch } from '../shared/http/github-fetch';
import { ViewerTeam } from './core/entities/inbox.interface';

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
 * One of the viewer's teams and who is in it.
 *
 * Members are lowercased logins, and include the viewer. A team whose members GitHub would not
 * list does not appear at all - see `load`.
 */
export interface ViewerTeamMembership {
  team: ViewerTeam;
  members: string[];
}

/**
 * The viewer's GitHub teams, and who is in each.
 *
 * The one thing separating "your team" from "everyone else" on the inbox, and the only part of
 * building it that GitHub will not answer in the main query. Asked with the user's own token, so
 * the answer is about them rather than about the app - the same reason the repository access
 * check next door uses theirs.
 *
 * ## Why team by team rather than one set of logins
 *
 * This used to answer with every teammate merged into one set, which is all the grouping needed
 * and one thing less than the settings need. A reader who strikes out a company-wide team is
 * saying that *that* team does not make somebody a colleague while their own still does, and a
 * merged set has already thrown that distinction away. Kept apart, the same answer serves both:
 * the grouping unions whatever is left after the exclusions, and the settings list the teams.
 *
 * Needs the app's "Organization permissions -> Members: Read". Without it GitHub answers 403,
 * this returns null, and every human lands in "everyone else" - which is a worse grouping and a
 * perfectly usable inbox. Nothing here is allowed to fail the whole page.
 */
@Injectable()
export class GithubViewerTeamsDataService {
  private readonly logger = new Logger(GithubViewerTeamsDataService.name);

  constructor(
    private readonly cache: InMemoryCacheService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Null means "could not establish", which callers must not read as "you are in no teams".
   */
  public async read(userId: string, accessToken: string): Promise<ViewerTeamMembership[] | null> {
    return this.cache.wrap<ViewerTeamMembership[] | null>(
      `github:teammates:${userId}`,
      (teams) => (teams ? TEAMMATES_TTL_MS : UNRESOLVED_TTL_MS),
      () => this.load(accessToken),
    );
  }

  private async load(accessToken: string): Promise<ViewerTeamMembership[] | null> {
    const teams = await this.readTeams(accessToken);

    if (!teams) {
      return null;
    }

    // Concurrently, and a team that cannot be read drops out rather than taking the rest with it.
    // A partial set of teams still groups most of the inbox correctly.
    //
    // Dropping it entirely rather than keeping it with no members, because the list goes out to
    // the settings: a team drawn with a checkbox that changes nothing is worse than a team that
    // is not drawn, and this way what is listed is exactly what is in force.
    const memberships = await Promise.all(
      teams.slice(0, MAX_TEAMS).map(async (team) => {
        const members = await this.readMembers(accessToken, team);

        return members && { team, members: members.map((login) => login.toLowerCase()) };
      }),
    );

    return memberships.filter((membership): membership is ViewerTeamMembership => !!membership);
  }

  private async readTeams(accessToken: string): Promise<ViewerTeam[] | null> {
    const body = await this.get(accessToken, 'user_teams', `https://api.github.com/user/teams?per_page=${PER_PAGE}`);

    if (!Array.isArray(body)) {
      return null;
    }

    return body
      .filter((team: any) => team?.slug && team?.organization?.login)
      .map((team: any) => {
        const org = String(team.organization.login);
        const slug = String(team.slug);

        return {
          // Lowercased, because this is what `excludedTeams` names and that arrives off a query
          // string somebody may have typed. Slugs are already lowercase; organisation names are
          // not reliably so.
          key: `${org}/${slug}`.toLowerCase(),
          org,
          slug,
          // GitHub always sends a name, but a team called by its slug reads better than a team
          // called nothing if it ever stops.
          name: typeof team.name === 'string' && team.name ? team.name : slug,
        };
      });
  }

  private async readMembers(accessToken: string, team: ViewerTeam): Promise<string[] | null> {
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
