import { ALL_NOTIFICATION_TYPES, NotificationType } from './entities/notification-type.enum';

/**
 * What somebody has switched off, everywhere.
 *
 * ## Why this stores the noes rather than the yeses
 *
 * Because the default is everything, and a list of what somebody wants would freeze today's
 * idea of "everything" at the moment they first touched a switch - so a type added next month
 * would arrive muted for every existing user, silently, and the only evidence would be pokes
 * that stopped coming. The same trap SubscriptionWriteService.create sidesteps by not writing a
 * type list on insert.
 *
 * Stored the other way round, a row that has never been written means nothing is muted, a row
 * that mutes one thing says exactly that, and a new type is on for everybody without a
 * migration or a backfill. The cost is that "mute everything" is the one setting that has to be
 * written out in full, which is the rare case rather than the universal one.
 *
 * ## Why it lives on the user rather than on the subscription
 *
 * Because it is a fact about the person, not about any one organisation. It rides along on the
 * profile - which the client reads before it renders anything - so the dashboard opens on the
 * real settings with no request of its own, and the webhook router already holds the user by
 * the time it needs them, so consulting these costs no lookup at all on the delivery path.
 */
export interface PokeSettings {
  mutedTypes: NotificationType[];
}

/** Opting in is already an explicit act; the useful default afterwards is everything. */
export const DEFAULT_POKE_SETTINGS: PokeSettings = { mutedTypes: [] };

/**
 * The settings as they sit on the user row: absent for anybody who has never moved a switch,
 * and plain strings rather than members of the enum.
 *
 * Loose on purpose, exactly like InboxStoredSettings - a value written by a newer deploy than
 * this one, or by an older one that still had a type this one has retired, has to read as
 * something rather than reaching the router.
 */
export interface PokeStoredSettings {
  mutedTypes?: string[];
}

/**
 * Fills in what a stored row leaves unsaid, and drops what it should not have said.
 *
 * Unrecognised values go rather than being trusted: a retired type cannot be allowed to match
 * anything, and - because this list is a *deny* list - a value nobody can spell any more would
 * otherwise sit there muting a type that no longer exists. Dropping it is also what makes
 * retiring a type free: `team_mention` in an old row simply stops meaning anything.
 */
export function normalizePokeSettings(stored: PokeStoredSettings | null | undefined): PokeSettings {
  const muted = (stored?.mutedTypes ?? []).filter((value): value is NotificationType =>
    ALL_NOTIFICATION_TYPES.includes(value as NotificationType),
  );

  return { mutedTypes: [...new Set(muted)] };
}

/**
 * The account-wide answer to "does this kind of poke reach this person at all".
 *
 * Deliberately the whole of what this file decides. Where a poke is allowed to come *from* is a
 * subscription's business - see isNotificationAllowed - and the two are combined by intersection
 * at the one place that has both: an organisation can narrow what somebody receives, never
 * widen it past what they asked for here.
 */
export function isPokeTypeMuted(settings: PokeSettings, type: NotificationType): boolean {
  return settings.mutedTypes.includes(type);
}
