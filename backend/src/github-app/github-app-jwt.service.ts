import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { getEnvConfig } from '../shared/configs/env-configs';

/**
 * Mints the short-lived JWT that identifies us as *the app itself*, as opposed to as a user or
 * as an installation. Uninstalling is an app-level act, so it needs this rather than a user
 * token - which is exactly why the caller has to do its own permission check first.
 */
@Injectable()
export class GithubAppJwtService {
  public sign(): string {
    const { appId, privateKey } = getEnvConfig().githubApp;

    const now = Math.floor(Date.now() / 1000);

    return jwt.sign(
      {
        // Backdated by a minute to survive clock skew against GitHub, which rejects tokens
        // issued in its future.
        iat: now - 60,
        // GitHub caps app JWTs at 10 minutes.
        exp: now + 9 * 60,
        iss: appId,
      },
      privateKey,
      { algorithm: 'RS256' },
    );
  }
}
