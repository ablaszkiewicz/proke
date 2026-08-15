import {
  ALL_NOTIFICATION_TYPES,
  NotificationType,
} from '../../notifications/core/entities/notification-type.enum';
import { SubscriptionEntity } from './entities/subscription.entity';
import {
  NotificationPreferencesNormalized,
  RepositoryPreferenceNormalized,
  RepositoryScope,
} from './entities/subscription.interface';

/**
 * What a subscription means when it says nothing: poke me about everything, everywhere. Opting
 * in is already an explicit act, so the useful default afterwards is "on", not "now go and
 * configure six switches".
 */
export function defaultPreferences(): NotificationPreferencesNormalized {
  return {
    repositoryScope: RepositoryScope.All,
    notificationTypes: [...ALL_NOTIFICATION_TYPES],
    repositories: [],
  };
}

/**
 * Fills in everything a stored row leaves unsaid.
 *
 * Rows written before preferences existed have none of these fields, and lean reads do not
 * apply schema defaults - so this is the only thing standing between an old subscription and a
 * user who quietly stops being poked. It has to treat absence as "everything", never as
 * "nothing", which is also why an empty stored array must survive intact: that one is a real
 * choice.
 */
export function normalizePreferences(
  subscription: Pick<
    SubscriptionEntity,
    'repositoryScope' | 'notificationTypes' | 'repositories'
  >,
): NotificationPreferencesNormalized {
  return {
    repositoryScope:
      subscription.repositoryScope === RepositoryScope.Selected
        ? RepositoryScope.Selected
        : RepositoryScope.All,
    notificationTypes: toNotificationTypes(subscription.notificationTypes) ?? [
      ...ALL_NOTIFICATION_TYPES,
    ],
    repositories: (subscription.repositories ?? []).map(
      (repository): RepositoryPreferenceNormalized => ({
        repositoryId: repository.repositoryId,
        repositoryFullName: repository.repositoryFullName,
        enabled: repository.enabled !== false,
        notificationTypes: toNotificationTypes(repository.notificationTypes),
      }),
    ),
  };
}

/**
 * The single question the router asks: given these preferences, does this repository and this
 * kind of event add up to a poke?
 *
 * Repository overrides win over installation-wide settings; within an override, an absent type
 * list inherits rather than blanks.
 */
export function isNotificationAllowed(
  preferences: NotificationPreferencesNormalized,
  repositoryId: string | undefined,
  type: NotificationType,
): boolean {
  const override = repositoryId
    ? preferences.repositories.find((r) => r.repositoryId === repositoryId)
    : undefined;

  if (preferences.repositoryScope === RepositoryScope.Selected) {
    // Nothing is covered unless it was picked - including an event we cannot attribute to a
    // repository at all. The narrowing scope fails closed.
    if (!override?.enabled) {
      return false;
    }
  } else if (override && !override.enabled) {
    // Explicitly muted out of an otherwise blanket subscription.
    return false;
  }

  return (override?.notificationTypes ?? preferences.notificationTypes).includes(type);
}

/**
 * Undefined in, undefined out - the caller needs to tell "never set" from "set to nothing".
 * Unrecognised values are dropped rather than trusted: a type we have since removed should not
 * be able to match anything.
 */
function toNotificationTypes(values: string[] | undefined): NotificationType[] | undefined {
  if (!values) {
    return undefined;
  }

  return values.filter((value): value is NotificationType =>
    ALL_NOTIFICATION_TYPES.includes(value as NotificationType),
  );
}
