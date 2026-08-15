import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InstallationNormalized } from '../installations/core/entities/installation.interface';
import { InstallationSerializer } from '../installations/core/entities/installation.serializer';

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

  public async listForUser(accessToken: string): Promise<InstallationNormalized[]> {
    const response = await fetch('https://api.github.com/user/installations?per_page=100', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 401) {
      throw new UnauthorizedException('GitHub rejected the stored access token');
    }

    if (!response.ok) {
      this.logger.warn(`GET /user/installations responded ${response.status}`);
      return [];
    }

    const body = await response.json();

    if (!Array.isArray(body?.installations)) {
      return [];
    }

    return body.installations.map((installation: any) =>
      InstallationSerializer.fromGithubPayload(installation),
    );
  }
}
