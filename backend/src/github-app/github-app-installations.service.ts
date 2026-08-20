import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { MetricsService } from '../analytics/metrics.service';
import { githubFetch } from '../shared/http/github-fetch';
import { GithubAppJwtService } from './github-app-jwt.service';

@Injectable()
export class GithubAppInstallationsService {
  private readonly logger = new Logger(GithubAppInstallationsService.name);

  constructor(
    private readonly jwtService: GithubAppJwtService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Removes the app from an account entirely - for everybody, not just the caller. Authorised
   * as the app, so GitHub applies no user-level permission check of its own here. Whoever
   * calls this is responsible for having established that the user may do it.
   */
  public async uninstall(installationId: string): Promise<void> {
    const response = await githubFetch(
      this.metrics,
      'app_installation_delete',
      `https://api.github.com/app/installations/${encodeURIComponent(installationId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.jwtService.sign()}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    // Already gone is the outcome the caller wanted.
    if (response.status === 404) {
      return;
    }

    if (!response.ok) {
      this.logger.error(`Uninstall of ${installationId} responded ${response.status}`);
      throw new InternalServerErrorException('GitHub refused to remove the installation');
    }
  }
}
