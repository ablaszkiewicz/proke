import { Injectable } from '@nestjs/common';
import { getEnvConfig } from '../../shared/configs/env-configs';
import { TokenResponse } from '../../shared/responses/token.response';
import { CustomJwtService } from '../custom-jwt/custom-jwt.service';
import { RefreshTokenService } from './refresh-token.service';

/**
 * Where a session is made and unmade.
 *
 * The two halves are issued together and only here, so there is one answer to "what does being
 * logged in consist of" and every way in - GitHub today, anything else later - gets the same one.
 * Logging in and refreshing both come out of `issue`, which is why the client can treat their
 * responses identically.
 */
@Injectable()
export class AuthSessionService {
  constructor(
    private readonly jwtService: CustomJwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  /** A fresh access token and a fresh session to refresh it with. What logging in returns. */
  public async issue(userId: string): Promise<TokenResponse> {
    const refreshToken = await this.refreshTokenService.issue(userId);

    return {
      token: await this.jwtService.sign({ id: userId }),
      refreshToken: refreshToken.token,
      expiresIn: getEnvConfig().auth.accessTokenTtlSeconds,
    };
  }

  /**
   * Spends a refresh token for a new access token, or null when it will not be spent.
   *
   * The refresh token comes back unchanged - see RefreshTokenService.redeem for why it is not
   * rotated - but it is returned anyway, so the client stores whatever the last response said
   * and never has to know whether this endpoint rotates.
   */
  public async refresh(refreshToken: string): Promise<TokenResponse | null> {
    const session = await this.refreshTokenService.redeem(refreshToken);

    if (!session) {
      return null;
    }

    return {
      token: await this.jwtService.sign({ id: session.userId }),
      refreshToken,
      expiresIn: getEnvConfig().auth.accessTokenTtlSeconds,
    };
  }

  /**
   * Ends this session. The access token it minted stays valid until it expires - it is a
   * signature, and nothing can call it back - which is the whole reason accessTokenTtlSeconds is
   * an hour rather than a week.
   */
  public async revoke(refreshToken: string): Promise<void> {
    await this.refreshTokenService.revoke(refreshToken);
  }

  /** Every session this user has, everywhere. Deleting an account goes through here. */
  public async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenService.revokeForUser(userId);
  }
}
