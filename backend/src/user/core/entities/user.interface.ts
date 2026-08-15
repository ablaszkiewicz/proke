import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuthMethod } from '../enum/auth-method.enum';

export class UserNormalized {
  id: string;
  githubId?: string;
  githubLogin?: string;
  email?: string;
  authMethod?: AuthMethod;
  avatarUrl?: string;
  // Server-side only. UserSerialized intentionally omits it - the access token must never
  // reach a client.
  githubAccessToken?: string;
}

export class UserSerialized {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  githubId?: string;

  @ApiPropertyOptional()
  githubLogin?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional({ enum: AuthMethod })
  authMethod?: AuthMethod;

  @ApiPropertyOptional()
  avatarUrl?: string;
}
