import { NotificationType } from '../../../notifications/core/entities/notification-type.enum';

export enum RepositoryScope {
  // Every repository the installation covers, minus anything explicitly muted below.
  All = 'all',
  // Only the repositories listed with `enabled: true`.
  Selected = 'selected',
}

export class RepositoryPreferenceNormalized {
  repositoryId: string;
  repositoryFullName?: string;
  enabled: boolean;
  // Undefined means "inherit the installation-wide list".
  notificationTypes?: NotificationType[];
}

export class NotificationPreferencesNormalized {
  repositoryScope: RepositoryScope;
  notificationTypes: NotificationType[];
  repositories: RepositoryPreferenceNormalized[];
}

export class SubscriptionNormalized {
  installationId: string;
  preferences: NotificationPreferencesNormalized;
}
