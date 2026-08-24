import {
  DEFAULT_INBOX_FILTERS,
  INBOX_FILTER_KEYS,
  RECENT_DRAFTS_VALUES,
  type InboxFilterKey,
  type InboxFilters,
  type RecentDrafts,
} from "@/lib/api/inbox.api";

/**
 * The settings, as they travel in the address bar - which is the only place they live.
 *
 * ## Why not local storage
 *
 * Because a filter is a statement about *this* look at the inbox, and storing it made that
 * statement permanent and invisible. Somebody who turned drafts off once got an inbox missing a
 * section for the rest of the year, with nothing on the page saying why - and no way to send
 * anybody the view they were looking at, because the view was in their browser rather than in
 * the link.
 *
 * The address bar has neither problem. It is visible, it is copyable, it survives a bookmark,
 * and it is forgotten the moment somebody opens the page fresh. A setting worth keeping is a
 * setting worth bookmarking, and that is now the same action.
 *
 * ## Why only what differs from the default
 *
 * So that the page as it comes is `/app/inbox` and nothing else. Writing every setting down
 * would put a query string on a page nobody has configured, freeze today's defaults into every
 * bookmark ever made, and make an ordinary link look like a filtered one.
 */

/** Everything optional: the address bar carries a setting only when it is not the default. */
export type InboxSearch = Partial<InboxFilters>;

/**
 * What the address bar was carrying, filled out with the defaults.
 *
 * Anything unrecognised falls back to its default rather than failing the navigation. A query
 * string is typed by hand, truncated by chat clients and rewritten by link shorteners, and the
 * right answer to a mangled one is the inbox - not an error page about a filter.
 *
 * Written out field by field on purpose: each value needs its own check, and the return type is
 * the complete `InboxFilters`, so a filter added and forgotten here does not compile.
 */
export function inboxFiltersFromSearch(search: {
  includeApproved?: unknown;
  recentDrafts?: unknown;
}): InboxFilters {
  return {
    includeApproved:
      typeof search.includeApproved === "boolean"
        ? search.includeApproved
        : DEFAULT_INBOX_FILTERS.includeApproved,
    recentDrafts: isRecentDrafts(search.recentDrafts)
      ? search.recentDrafts
      : DEFAULT_INBOX_FILTERS.recentDrafts,
  };
}

/**
 * What to put in the address bar for a given set of choices.
 *
 * A loop rather than a field-by-field list, because unlike reading there is one rule for every
 * filter whatever its type: if it is the default it is not written down.
 */
export function inboxSearchFromFilters(filters: InboxFilters): InboxSearch {
  const search: InboxSearch = {};

  for (const key of INBOX_FILTER_KEYS) {
    carry(search, filters, key);
  }

  return search;
}

/**
 * One filter, written down or left out.
 *
 * A function of its own only so the key is a type parameter rather than the union of every key:
 * `search[key] = filters[key]` is an assignment TypeScript can check when both sides are
 * indexed by the same `Key`, and cannot when `key` could be any of them.
 */
function carry<Key extends InboxFilterKey>(
  search: InboxSearch,
  filters: InboxFilters,
  key: Key
): void {
  if (filters[key] !== DEFAULT_INBOX_FILTERS[key]) {
    search[key] = filters[key];
  }
}

function isRecentDrafts(value: unknown): value is RecentDrafts {
  return RECENT_DRAFTS_VALUES.includes(value as RecentDrafts);
}
