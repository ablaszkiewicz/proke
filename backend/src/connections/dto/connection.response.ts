import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../../notifications/core/entities/notification-type.enum';
import { RepositoryScope } from '../../subscriptions/core/entities/subscription.interface';

export enum ConnectionStatus {
  // Installed and this user has opted in.
  Subscribed = 'subscribed',
  // Installed - usually by a colleague - but this user has not opted in yet.
  Available = 'available',
  // Installed, then suspended by the account. No events are being delivered.
  Suspended = 'suspended',
}

export class RepositoryPreferenceResponse {
  @ApiProperty({ description: "GitHub's numeric repository id, as a string" })
  repositoryId: string;

  @ApiPropertyOptional()
  repositoryFullName?: string;

  @ApiProperty({
    description:
      "Under 'all' scope, false mutes this repository. Under 'selected', only repositories " +
      'listed here with true are covered.',
  })
  enabled: boolean;

  @ApiPropertyOptional({
    enum: NotificationType,
    isArray: true,
    description: 'Omitted means the installation-wide list applies',
  })
  notificationTypes?: NotificationType[];
}

export class NotificationPreferencesResponse {
  @ApiProperty({ enum: RepositoryScope })
  repositoryScope: RepositoryScope;

  @ApiProperty({
    enum: NotificationType,
    isArray: true,
    description: 'The default for every repository without an override',
  })
  notificationTypes: NotificationType[];

  @ApiProperty({ type: [RepositoryPreferenceResponse] })
  repositories: RepositoryPreferenceResponse[];
}

export class ConnectionResponse {
  @ApiProperty()
  installationId: string;

  @ApiProperty()
  accountLogin: string;

  @ApiProperty({ description: "'User' or 'Organization'" })
  accountType: string;

  @ApiProperty({ enum: ConnectionStatus })
  status: ConnectionStatus;

  @ApiPropertyOptional({ description: "'all' or 'selected'" })
  repositorySelection?: string;

  @ApiProperty({ description: 'Where to change which repositories the install covers' })
  manageUrl: string;

  @ApiPropertyOptional({
    type: NotificationPreferencesResponse,
    description: 'Present only while subscribed - preferences are what an opt-in contains',
  })
  preferences?: NotificationPreferencesResponse;
}

export class ConnectionsResponse {
  @ApiProperty({ type: [ConnectionResponse] })
  connections: ConnectionResponse[];

  @ApiPropertyOptional({
    description:
      'True when proke holds no usable GitHub authorization for this user - never granted, or ' +
      'revoked since. The connection list is empty because it could not be read, not because ' +
      'there is nothing in it, and the fix is to sign in with GitHub again. Deliberately not a ' +
      '401: the proke session is fine, and answering 401 signs the user out of a working account.',
  })
  githubReauthRequired?: boolean;

  @ApiProperty({
    description:
      'Where to send a user who wants to add an account we cannot see yet. A GitHub App ' +
      'can only ever see accounts it is installed on, so orgs without an install are not ' +
      'enumerable - GitHub own this picker.',
  })
  installUrl: string;
}
