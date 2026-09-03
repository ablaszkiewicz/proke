import { ApiProperty } from '@nestjs/swagger';

/**
 * A whole session, as the client receives it. Both halves and the clock, in one shape - returned
 * by logging in and by refreshing, so the client has one thing to store either way.
 */
export class TokenResponse {
  /** The access token. Sent as `Authorization: Bearer` on every request, and short-lived. */
  @ApiProperty()
  token: string;

  /**
   * The refresh token. Never sent as a bearer token - it is spent at POST /auth/refresh and
   * nowhere else - and it outlives many access tokens.
   */
  @ApiProperty()
  refreshToken: string;

  /**
   * Seconds the access token has left, from now.
   *
   * Here so the browser can refresh a moment *before* it expires rather than after, which is the
   * difference between a background request nobody sees and a 401 in the middle of somebody's
   * click. Sent rather than left to be read out of the JWT, because a client that has to decode
   * a token to use it is a client that has to care what is in it.
   */
  @ApiProperty()
  expiresIn: number;
}
