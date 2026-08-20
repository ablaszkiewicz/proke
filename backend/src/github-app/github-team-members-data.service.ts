import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../analytics/metrics.service';
import { InMemoryCacheService } from '../shared/cache/in-memory-cache.service';
import { githubFetch } from '../shared/http/github-fetch';
import { GithubAppTokenService } from './github-app-token.service';

/**
 * A blast radius rather than a paging limit: past this many, one person typing eighteen
 * characters stops being a question to a group and starts being an announcement.
 *
 * It doubles as the page size, so GitHub offering a second page is the same statement as
 * "too big" and the check costs no extra request.
 */
export const MAX_TEAM_MEMBERS = 100;

const MEMBERS_TTL_MS = 10 * 60_000;
/** Short, because unresolvable covers a transient 500 as well as a team that does not exist. */
const UNRESOLVED_TTL_MS = 60_000;

export interface GithubTeamMember {
  githubId: string;
  githubLogin: string;
}

/**
 * Who is in a team. Webhook payloads never say, so a team mention costs an API call where a
 * plain @handle costs a database read.
 *
 * Needs the app's "Organization permissions -> Members: Read". Without it GitHub answers 403 and
 * every team mention resolves to nobody, silently.
 */
@Injectable()
export class GithubTeamMembersDataService {
  private readonly logger = new Logger(GithubTeamMembersDataService.name);

  constructor(
    private readonly tokenService: GithubAppTokenService,
    private readonly cache: InMemoryCacheService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Null where we could not establish the members - no such team, not visible, or too big.
   * Never "nobody": callers must not read it as a team that happens to be empty.
   *
   * Keyed on the team rather than the installation, because membership is a fact about the org.
   */
  public async listMembers(
    installationId: string,
    org: string,
    slug: string,
  ): Promise<GithubTeamMember[] | null> {
    return this.cache.wrap<GithubTeamMember[] | null>(
      `github:team-members:${org.toLowerCase()}/${slug.toLowerCase()}`,
      (members) => (members ? MEMBERS_TTL_MS : UNRESOLVED_TTL_MS),
      () => this.read(installationId, org, slug),
    );
  }

  private async read(
    installationId: string,
    org: string,
    slug: string,
  ): Promise<GithubTeamMember[] | null> {
    const token = await this.tokenService.read(installationId);

    if (!token) {
      return null;
    }

    let response: Response;

    try {
      response = await githubFetch(
        this.metrics,
        'team_members',
        `https://api.github.com/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(slug)}` +
          `/members?per_page=${MAX_TEAM_MEMBERS}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
    } catch (error) {
      // Null is this method's word for "could not establish", and unreachable is exactly that.
      // Thrown, it would take down the routing of the whole event rather than one team mention.
      this.logger.warn(`Could not reach GitHub about ${org}/${slug}: ${error}`);
      return null;
    }

    // Frequent and unremarkable: people write `@acme/anything` in prose, and only some of those
    // are teams.
    if (response.status === 404) {
      this.logger.debug(`No team ${org}/${slug}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(
        `Could not read members of ${org}/${slug} (${response.status}). The app may be missing ` +
          'the "Members" organization permission.',
      );
      return null;
    }

    if (hasNextPage(response)) {
      this.logger.log(`Skipping ${org}/${slug}: more than ${MAX_TEAM_MEMBERS} members`);
      return null;
    }

    const body = await response.json();

    if (!Array.isArray(body)) {
      this.logger.warn(`Unexpected members payload for ${org}/${slug}`);
      return null;
    }

    return body
      .filter((member) => member?.id && member?.login)
      .map((member) => ({ githubId: String(member.id), githubLogin: member.login }));
  }
}

/** A full page could be a team of exactly the cap or of a thousand; only this separates them. */
function hasNextPage(response: Response): boolean {
  return /rel="next"/.test(response.headers.get('link') ?? '');
}
