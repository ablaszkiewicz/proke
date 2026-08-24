/**
 * What the reader has asked to be shown, and why it is decided here rather than in the browser.
 *
 * A filter looks like a display preference and is not one. "Already approved" needs GitHub's
 * review decision, which is the same class of fact as "is this author a teammate" or "is this
 * thread still open" - something no browser can see. So the client owns the words on the toggle
 * and nothing else, exactly as it owns the words on a section heading and nothing else.
 *
 * ## Adding one
 *
 * Add its name to INBOX_FILTER_NAMES, its default to DEFAULT_INBOX_FILTERS, a field to
 * InboxFiltersQuery, and the rule itself to the classifier. The type and the cache key follow
 * from the name list on their own.
 *
 * Names read as what they *include*, never as what they hide. A `hideApproved: false` and an
 * `includeApproved: true` mean the same thing and only one of them can be read aloud.
 */
export const INBOX_FILTER_NAMES = ['includeApproved'] as const;

export type InboxFilterName = (typeof INBOX_FILTER_NAMES)[number];

/**
 * One reader's choices, complete - never partial. Everything downstream of the controller takes
 * this rather than a query object, so no rule has to decide what an absent filter meant.
 */
export type InboxFilters = { [Name in InboxFilterName]: boolean };

/**
 * What somebody who has never opened the settings gets.
 *
 * `includeApproved: false`, because a pull request that is already approved is not waiting on
 * you in any sense that matters - the review it wanted has happened, and leaving it in the pile
 * makes the pile a worse answer to "what is left to do". Anyone who disagrees can say so once
 * and the browser remembers.
 */
export const DEFAULT_INBOX_FILTERS: InboxFilters = {
  includeApproved: false,
};

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
  return INBOX_FILTER_NAMES.map((name) => `${name}=${filters[name] ? 1 : 0}`).join(',');
}
