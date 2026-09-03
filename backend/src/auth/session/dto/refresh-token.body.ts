import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Used by both /auth/refresh and /auth/logout. In the body rather than in a header, because it
 * is not a bearer token: it names one session, is spent at exactly these two routes, and putting
 * it where `Authorization` goes would invite it onto every other request too.
 */
export class RefreshTokenBody {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
