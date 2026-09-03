import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { TokenResponse } from '../../shared/responses/token.response';
import { Public } from '../core/decorators/is-public';
import { AuthSessionService } from './auth-session.service';
import { RefreshTokenBody } from './dto/refresh-token.body';

/**
 * Both routes are public, and that is not an oversight: the refresh token in the body *is* the
 * credential. Requiring an access token as well would make the one endpoint whose job is to
 * survive an expired access token the one endpoint an expired access token locks you out of.
 */
@Public()
@Controller('auth')
@ApiTags('Auth (session)')
export class AuthSessionController {
  constructor(private readonly authSessionService: AuthSessionService) {}

  @Post('refresh')
  @ApiResponse({ type: TokenResponse })
  public async refresh(@Body() payload: RefreshTokenBody): Promise<TokenResponse> {
    const session = await this.authSessionService.refresh(payload.refreshToken);

    // 401 rather than 400: an unknown, revoked or lapsed token is a session that has ended, and
    // the client's answer to that is to send somebody back to the login button - which is what
    // it already does with a 401 from anywhere else.
    if (!session) {
      throw new UnauthorizedException('That session has ended. Sign in again.');
    }

    return session;
  }

  /**
   * Ends the session. Answers 204 whether or not the token was still live: a sign-out that
   * reports failure gives the client something it cannot act on - it is signing out either way -
   * and would tell an unauthenticated caller which tokens exist.
   */
  @Post('logout')
  @HttpCode(204)
  public async logout(@Body() payload: RefreshTokenBody): Promise<void> {
    await this.authSessionService.revoke(payload.refreshToken);
  }
}
