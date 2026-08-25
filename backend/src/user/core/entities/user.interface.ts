import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InboxFilters } from '../../../inbox/core/entities/inbox-filters.interface';
import { InboxSettingsResponse } from '../../../inbox/dto/inbox-settings.response';
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
  // Complete, never partial: filled from the defaults by the serializer, so nothing reading a
  // user has to decide what an absent filter meant.
  inboxSettings: InboxFilters;
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

  // On the user rather than behind a route of its own, because the client reads the user before
  // it renders anything - so the inbox opens on the right settings with no request of its own,
  // and no frame drawn on the defaults first.
  @ApiProperty({ type: InboxSettingsResponse })
  inboxSettings: InboxSettingsResponse;
}
