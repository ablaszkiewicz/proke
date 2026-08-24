import {
  DEFAULT_INBOX_FILTERS,
  RECENT_DRAFTS_VALUES,
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
 *
 * ## Why the lists are one comma-separated word
 *
 * Because somebody is meant to be able to read their own address bar. `?ignoredAuthors=
 * dependabot,renovate` says what it does; the JSON array a router would otherwise write -
 * `?ignoredAuthors=%5B%22dependabot%22%5D` - says nothing to anyone. It is also exactly the
 * shape the server reads, so the query string the page carries and the query string it sends
 * are the same string.
 */

/**
 * Everything optional: the address bar carries a setting only when it is not the default.
 *
 * The two lists are strings here and arrays everywhere else, which is the one place those two
 * spellings meet. Nothing downstream sees the joined form.
 */
export interface InboxSearch {
  includeApproved?: boolean;
  recentDrafts?: RecentDrafts;
  separateTeam?: boolean;
  separateBots?: boolean;
  excludedTeams?: string;
  ignoredAuthors?: string;
}

/** Whatever the address bar might have had under each name, before any of it is believed. */
type RawSearch = Partial<Record<keyof InboxSearch, unknown>>;

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
export function inboxFiltersFromSearch(search: RawSearch): InboxFilters {
  return {
    includeApproved: flag(search.includeApproved, DEFAULT_INBOX_FILTERS.includeApproved),
    recentDrafts: isRecentDrafts(search.recentDrafts)
      ? search.recentDrafts
      : DEFAULT_INBOX_FILTERS.recentDrafts,
    separateTeam: flag(search.separateTeam, DEFAULT_INBOX_FILTERS.separateTeam),
    separateBots: flag(search.separateBots, DEFAULT_INBOX_FILTERS.separateBots),
    excludedTeams: list(search.excludedTeams),
    ignoredAuthors: list(search.ignoredAuthors),
  };
}

/**
 * What to put in the address bar for a given set of choices.
 *
 * Field by field for the same reason as reading it, and because the two lists have to be joined
 * on the way out - there is no one rule covering every filter here the way there is on the wire.
 */
export function inboxSearchFromFilters(filters: InboxFilters): InboxSearch {
  const search: InboxSearch = {};

  if (filters.includeApproved !== DEFAULT_INBOX_FILTERS.includeApproved) {
    search.includeApproved = filters.includeApproved;
  }

  if (filters.recentDrafts !== DEFAULT_INBOX_FILTERS.recentDrafts) {
    search.recentDrafts = filters.recentDrafts;
  }

  if (filters.separateTeam !== DEFAULT_INBOX_FILTERS.separateTeam) {
    search.separateTeam = filters.separateTeam;
  }

  if (filters.separateBots !== DEFAULT_INBOX_FILTERS.separateBots) {
    search.separateBots = filters.separateBots;
  }

  if (filters.excludedTeams.length > 0) {
    search.excludedTeams = filters.excludedTeams.join(",");
  }

  if (filters.ignoredAuthors.length > 0) {
    search.ignoredAuthors = filters.ignoredAuthors.join(",");
  }

  return search;
}

/**
 * A boolean, or the default.
 *
 * The string forms are here because the address bar is hand-editable and a router is entitled to
 * hand back whatever it found: `?separateTeam=false` typed by a person parses to the word rather
 * than the value under some parsers and the value under others, and the page should not depend
 * on which.
 */
function flag(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "false") {
    return value === "true";
  }

  return fallback;
}

/**
 * A comma-separated word as the list it stands for.
 *
 * Normalised the same way the server normalises it - trimmed, lowercased, deduplicated - so that
 * what the panel draws as ticked and what the server actually matched on are the same thing. A
 * hand-typed `?ignoredAuthors=Dependabot` must not leave a chip on screen that the rows disagree
 * with.
 */
function list(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  const seen = new Set<string>();

  for (const part of value.split(",")) {
    const normalized = part.trim().toLowerCase();

    if (normalized) {
      seen.add(normalized);
    }
  }

  return [...seen];
}

function isRecentDrafts(value: unknown): value is RecentDrafts {
  return RECENT_DRAFTS_VALUES.includes(value as RecentDrafts);
}
