/**
 * What the reader has asked to be shown, and why it is decided here rather than in the browser.
 *
 * A filter looks like a display preference and is not one. "Already approved" needs GitHub's
 * review decision, and "touched in the last six hours" needs GitHub's `updatedAt` - the same
 * class of fact as "is this author a teammate" or "is this thread still open", something no
 * browser can see. So the client owns the words on the toggle and nothing else, exactly as it
 * owns the words on a section heading and nothing else.
 *
 * ## Adding one
 *
 * Add a field to InboxFilters, its default to DEFAULT_INBOX_FILTERS, a field to
 * InboxFiltersQuery, and the rule itself to the classifier. The name list and the cache key
 * follow from the defaults on their own, and `toInboxFilters` does not compile until the new
 * filter is read off the query.
 *
 * Names read as what they *include*, never as what they hide. A `hideApproved: false` and an
 * `includeApproved: true` mean the same thing and only one of them can be read aloud.
 *
 * ## What a filter's value is allowed to be
 *
 * A boolean, or one of a short list of named values. Never a number, a date, or anything else
 * open-ended - because a snapshot is *built* under one set of filters and filed under it, so
 * the number of stored inboxes per person is the product of every filter's cardinality. Two
 * booleans and six windows is twelve; a free "how many hours" would be as many as anybody
 * thought to type. See InboxStoreService.
 */

/**
 * How long a draft counts as work in progress rather than as something put down.
 *
 * The default is a day, because that is the span that survives an evening and a night: a draft
 * pushed at six and opened again at nine the next morning is the same piece of work, and
 * anything shorter would file it away overnight. The rest are here because whose day is whose
 * is not ours to decide - somebody who reviews in the morning wants six hours, and somebody
 * halfway through a fortnight's work wants seven days.
 */
export const RECENT_DRAFT_WINDOW_MS = {
  '6h': 6 * 60 * 60_000,
  '12h': 12 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '3d': 3 * 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
} as const;

export type RecentDraftWindow = keyof typeof RECENT_DRAFT_WINDOW_MS;

export const RECENT_DRAFT_WINDOWS = Object.keys(RECENT_DRAFT_WINDOW_MS) as RecentDraftWindow[];

/**
 * The `recentDrafts` filter: a window, or `off`.
 *
 * `off` is a member of the same field rather than a flag beside it. A separate boolean would
 * let somebody write down a window that is not in force - "off, and by the way, three days" -
 * and every reader of the pair would then have to decide what that meant. Here the invalid
 * state cannot be expressed at all.
 */
export type RecentDrafts = RecentDraftWindow | 'off';

export const RECENT_DRAFTS_VALUES: readonly RecentDrafts[] = ['off', ...RECENT_DRAFT_WINDOWS];

/**
 * One reader's choices, complete - never partial. Everything downstream of the controller takes
 * this rather than a query object, so no rule has to decide what an absent filter meant.
 */
export interface InboxFilters {
  includeApproved: boolean;
  recentDrafts: RecentDrafts;
}

export type InboxFilterName = keyof InboxFilters;

/** Typed as a window rather than as a `RecentDrafts`, so the default can never be `off`. */
export const DEFAULT_RECENT_DRAFT_WINDOW: RecentDraftWindow = '1d';

/**
 * What somebody who has never opened the settings gets.
 *
 * `includeApproved: false`, because a pull request that is already approved is not waiting on
 * you in any sense that matters - the review it wanted has happened, and leaving it in the pile
 * makes the pile a worse answer to "what is left to do".
 *
 * `recentDrafts` on, because the split is the only thing that makes the drafts pile shuttable:
 * the one you pushed to this morning gets a heading of its own that arrives open, and the
 * eleven from March stay behind one that arrives closed. Turning it off puts every draft back
 * in the one pile, which is what somebody who does not work in drafts wants to see.
 */
export const DEFAULT_INBOX_FILTERS: InboxFilters = {
  includeApproved: false,
  recentDrafts: DEFAULT_RECENT_DRAFT_WINDOW,
};

/**
 * Every filter's name, taken from the defaults rather than written out beside them.
 *
 * A second list would be a list to forget: a filter missing from it would be missing from the
 * cache key and from the query the controller assembles, and nothing would fail to compile. The
 * defaults are already required to be complete - the object is typed `InboxFilters` - so they
 * are the list.
 *
 * The order is the order they are declared in, which is the order they appear in a cache key.
 * Reordering them costs one round of misses and nothing else.
 */
export const INBOX_FILTER_NAMES = Object.keys(DEFAULT_INBOX_FILTERS) as InboxFilterName[];

/** How far back "recent" reaches, or null where the reader asked for no such distinction. */
export function recentDraftWindowMs(recentDrafts: RecentDrafts): number | null {
  return recentDrafts === 'off' ? null : RECENT_DRAFT_WINDOW_MS[recentDrafts];
}

/**
 * A short, stable string standing for one set of choices.
 *
 * Part of a cached snapshot's key, because the snapshot is *built* under these filters - the
 * rows a filter removes are gone from the stored document, not hidden when it is served. Two
 * readers of the same account with different settings therefore hold two different answers, and
 * a key that ignored the filters would hand one of them the other's.
 *
 * Every name appears whatever its value, so the key is the same length and the same shape for
 * everybody, and adding a filter cannot make an old key accidentally match a new one.
 */
export function inboxFiltersKey(filters: InboxFilters): string {
  return INBOX_FILTER_NAMES.map((name) => `${name}=${keyPart(filters[name])}`).join(',');
}

/**
 * Booleans as 1/0; everything else is already one short word from a closed set, so it goes in
 * as itself. Nothing here escapes anything, which is safe only because of that closed set - a
 * filter whose value could contain a `,` or an `=` would need this to do more than it does.
 */
function keyPart(value: InboxFilters[InboxFilterName]): string {
  return typeof value === 'boolean' ? (value ? '1' : '0') : value;
}
