import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../analytics/metrics.service';
import { githubFetch } from '../shared/http/github-fetch';

export type OrgRole = 'admin' | 'member';

/**
 * Reads the caller's own role in an organisation, using *their* token - so GitHub answers
 * about them specifically rather than about the app.
 *
 * Requires the app's "Organization permissions -> Members: Read". Without it GitHub answers
 * 403 and this returns null, which callers must treat as "not permitted" rather than
 * "permitted": failing open here would let any org member uninstall for everyone.
 */
@Injectable()
export class GithubOrgMembershipDataService {
  private readonly logger = new Logger(GithubOrgMembershipDataService.name);

  constructor(private readonly metrics: MetricsService) {}

  public async readRole(accessToken: string, org: string): Promise<OrgRole | null> {
    const response = await githubFetch(
      this.metrics,
      'org_membership',
      `https://api.github.com/user/memberships/orgs/${encodeURIComponent(org)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (!response.ok) {
      this.logger.warn(
        `Could not read membership of ${org} (${response.status}). The app may be missing ` +
          'the "Members" organization permission.',
      );
      return null;
    }

    const membership = await response.json();

    if (membership?.state !== 'active') {
      return null;
    }

    return membership.role === 'admin' ? 'admin' : 'member';
  }
}
