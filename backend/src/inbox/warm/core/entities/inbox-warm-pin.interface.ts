import {
  DEFAULT_BUILD_FILTERS,
  InboxBuildFilters,
  inboxFiltersKey,
  RECENT_DRAFTS_VALUES,
  RecentDrafts,
} from '../../../core/entities/inbox-filters.interface';
import { WarmPinEntity } from './inbox-warm-pin.entity';

/**
 * How many views one person may keep ready.
 *
 * Three, against a space of twelve: there are two build filters, a boolean and one of six
 * windows, so twelve is every distinct thing that can be warmed in the entire product. The cap
 * is not there to protect the cache - it is there to bound what proke asks GitHub for on
 * somebody's behalf while they are not looking. Three pins is 36 GraphQL queries an hour against
 * a 5,000-an-hour per-user budget.
 */
export const MAX_WARM_PINS = 3;

/** One pin, as everything above the collection reads it: complete, never partial. */
export interface InboxWarmPin {
  /** Recomputed from the filters below, never the stored copy. See WarmPinEntity.key. */
  key: string;
  filters: InboxBuildFilters;
  pinnedAt: Date;
}

/**
 * A stored pin, filled out from the defaults.
 *
 * The same job normalizePreferences does for subscriptions, and for the same reason: a build
 * filter added next month means every pin already written is missing a field, and a read that
 * fills it in is a migration that never has to be run.
 *
 * The key is recomputed rather than taken from the row, so a pin written before that filter
 * existed still warms the key today's cache is actually filed under.
 */
export function normalizeWarmPin(pin: WarmPinEntity): InboxWarmPin {
  const filters: InboxBuildFilters = {
    includeApproved: pin.includeApproved ?? DEFAULT_BUILD_FILTERS.includeApproved,
    recentDrafts: isRecentDrafts(pin.recentDrafts)
      ? pin.recentDrafts
      : DEFAULT_BUILD_FILTERS.recentDrafts,
  };

  return {
    key: inboxFiltersKey(filters),
    filters,
    // A row written before this field existed would have none. `pinnedAt` is only ever shown,
    // never compared, so the epoch is a harmless answer and an absent date is not.
    pinnedAt: pin.pinnedAt ?? new Date(0),
  };
}

/**
 * Every pin on one document, in the order they are always shown.
 *
 * Sorted by key rather than by when it was pinned, and that is a decision about the panel
 * rather than about storage. There are twelve possible keys, so sorting by one puts a person's
 * pins in the same order every time they open the drawer - and, more to the point, means undoing
 * a removal puts the row back exactly where it was. Ordered by `pinnedAt`, an undone row would
 * reappear at the bottom, which is the one thing an undo must not do.
 */
export function normalizeWarmPins(pins: WarmPinEntity[] | undefined): InboxWarmPin[] {
  return (pins ?? [])
    .map(normalizeWarmPin)
    .sort((left, right) => left.key.localeCompare(right.key));
}

function isRecentDrafts(value: unknown): value is RecentDrafts {
  return RECENT_DRAFTS_VALUES.includes(value as RecentDrafts);
}
