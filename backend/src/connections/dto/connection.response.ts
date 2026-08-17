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

/**
 * What the caller is to the account an installation sits on - not what they are to proke.
 *
 * Owner is the person who can remove the app for everyone: the account holder on a personal
 * installation, an organisation owner on an org one. Everybody else is a member, including
 * somebody a colleague shared a single repository with.
 */
export enum ViewerRole {
  Owner = 'owner',
  Member = 'member',
}

export class AccessibleRepositoryResponse {
  @ApiProperty({ description: "GitHub's numeric repository id, as a string" })
  repositoryId: string;

  @ApiProperty({ description: 'owner/name' })
  fullName: string;

  @ApiProperty()
  private: boolean;
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

  @ApiPropertyOptional({
    description:
      "'all' or 'selected' - what the installer granted the app, which is the same string for " +
      'everybody who can see the installation. Use repositoryCount for what *this* user reaches.',
  })
  repositorySelection?: string;

  @ApiPropertyOptional({
    enum: ViewerRole,
    description: 'Absent when GitHub would not say - the app may lack the Members permission',
  })
  viewerRole?: ViewerRole;

  @ApiPropertyOptional({
    description:
      'How many repositories this user reaches through the installation. Absent when GitHub ' +
      'could not be asked, which is not the same as zero.',
  })
  repositoryCount?: number;

  @ApiPropertyOptional({
    type: [AccessibleRepositoryResponse],
    description: `Up to the first hundred of them by name. Shorter than repositoryCount on a
      large account, so render the count from repositoryCount rather than from this length.`,
  })
  repositories?: AccessibleRepositoryResponse[];

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
