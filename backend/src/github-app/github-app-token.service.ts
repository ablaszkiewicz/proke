import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../analytics/metrics.service';
import { InMemoryCacheService } from '../shared/cache/in-memory-cache.service';
import { githubFetch } from '../shared/http/github-fetch';
import { GithubAppJwtService } from './github-app-jwt.service';

/** Renewed this far ahead of GitHub's expiry, to cover clock skew and a request that lands late. */
const RENEW_BEFORE_MS = 5 * 60_000;
const ASSUMED_LIFETIME_MS = 60 * 60_000;

/** Long enough that a misconfigured app is not a GitHub call per webhook. */
const UNAVAILABLE_TTL_MS = 60_000;

interface InstallationToken {
  token: string;
  expiresAt: number;
}

/**
 * The credential for acting inside one org, as opposed to the app JWT next door, which
 * identifies us as the app across all of them. The two can do different things: the app JWT can
 * administer installations but not read an org's data, and this one is the other way round.
 */
@Injectable()
export class GithubAppTokenService {
  private readonly logger = new Logger(GithubAppTokenService.name);

  constructor(
    private readonly jwtService: GithubAppJwtService,
    private readonly cache: InMemoryCacheService,
    private readonly metrics: MetricsService,
  ) {}

  /** Null when GitHub would not give us one - "cannot answer", never "no". */
  public async read(installationId: string): Promise<string | null> {
    const cached = await this.cache.wrap<InstallationToken | null>(
      `github:installation-token:${installationId}`,
      (token) =>
        token ? Math.max(0, token.expiresAt - Date.now() - RENEW_BEFORE_MS) : UNAVAILABLE_TTL_MS,
      () => this.mint(installationId),
    );

    return cached?.token ?? null;
  }

  private async mint(installationId: string): Promise<InstallationToken | null> {
    let appJwt: string;

    try {
      appJwt = this.jwtService.sign();
    } catch (error) {
      // A missing or malformed key. Nothing recovers from it, but it must not take out the
      // delivery of every other poke in the same event.
      this.logger.error(`Could not sign an app JWT: ${error}`);
      return null;
    }

    let response: Response;

    try {
      response = await githubFetch(
        this.metrics,
        'app_installation_token',
        `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${appJwt}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
    } catch (error) {
      // GitHub unreachable is "cannot answer", the same as GitHub refusing - and this method
      // promises null for that. Thrown, it would escape every caller instead: routing one
      // webhook would die on the way to minting a token, and every recipient of that event
      // would lose their poke over a picture or a line count.
      this.logger.warn(`Could not reach GitHub to mint a token for ${installationId}: ${error}`);
      return null;
    }

    if (!response.ok) {
      this.logger.warn(
        `Could not mint an access token for installation ${installationId} (${response.status})`,
      );
      return null;
    }

    const body = await response.json();

    if (!body?.token) {
      this.logger.warn(`GitHub returned no token for installation ${installationId}`);
      return null;
    }

    return {
      token: body.token,
      expiresAt: Date.parse(body.expires_at ?? '') || Date.now() + ASSUMED_LIFETIME_MS,
    };
  }
}
