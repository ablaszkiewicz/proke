import axios from "axios";

/**
 * Which pile a pull request landed in. The server decides - every rule behind it needs
 * something the browser does not have, like whether a review thread is still open or whether
 * the author is a teammate. The client owns the words on the heading and nothing else.
 */
export type InboxSectionKey =
  | "approved"
  | "unresolved-comments"
  | "waiting-for-reviewers"
  | "recent-drafts"
  | "drafts"
  | "team"
  | "others"
  | "bots";

export interface InboxAuthor {
  login: string;
  avatarUrl?: string;
}

export interface InboxPullRequest {
  /** GitHub's node id. Survives a repository or author rename, so it is the render key. */
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  repositoryId: string;
  repositoryFullName: string;
  author: InboxAuthor;
}

export interface InboxSectionData {
  key: InboxSectionKey;
  /** Server-ordered. Render in the order given. */
  pullRequests: InboxPullRequest[];
}

/**
 * How long a draft counts as work in progress rather than as something put down, mirroring the
 * server's list. The strings are the values on the wire *and* the words on the buttons - see
 * components/inbox/filters.ts - which is why they are this short.
 */
export const RECENT_DRAFT_WINDOWS = ["6h", "12h", "1d", "3d", "7d"] as const;

export type RecentDraftWindow = (typeof RECENT_DRAFT_WINDOWS)[number];

/**
 * The `recentDrafts` filter: a window, or `off`.
 *
 * `off` is a member of the same field rather than a flag beside it, so a window that is not in
 * force cannot be written down - not here, not on the wire, and not on the account.
 */
export type RecentDrafts = RecentDraftWindow | "off";

export const RECENT_DRAFTS_VALUES: readonly RecentDrafts[] = [
  "off",
  ...RECENT_DRAFT_WINDOWS,
];

/**
 * One of the viewer's GitHub teams, as the server established it.
 *
 * Arrives on the inbox itself rather than from a request of its own: the server works these out
 * to do the grouping anyway, so carrying them costs nothing and the settings can list them
 * without a second round trip. Absent until GitHub has answered - see `InboxResult.teams`.
 */
export interface InboxTeam {
  /** `org/slug`, lowercased. What `excludedTeams` names, and the render key. */
  key: string;
  org: string;
  slug: string;
  /** GitHub's display name for the team, which is not its slug. */
  name: string;
}

/**
 * Every filter, in two kinds, and the shape the server takes them in.
 *
 * ## Why they are in two kinds
 *
 * A **build** filter is about the pull request - its review decision, when it last moved. The
 * server bakes those into the snapshot it stores, so changing one means a new answer from
 * GitHub.
 *
 * A **view** filter is about its author - machine, teammate, someone you never want to see. The
 * server applies those to a stored snapshot on the way out, so changing one is answered from
 * what it already has, in a millisecond and with no trip to GitHub.
 *
 * The client cares because those are two different things to do about a switch being pressed:
 * one is a refresh and one is a re-read. See inboxLogic. It is the only reason this distinction
 * is on this side at all - the server would be perfectly correct if the client refreshed for
 * everything, just slower for four of the six.
 *
 * ## The names
 *
 * They read as what they *include* rather than what they hide, which is the only way a toggle
 * can be labelled without a double negative under it. `excludedTeams` and `ignoredAuthors` are
 * the exception: their default is everything, so a list of what to keep would silently drop the
 * team you join next month.
 *
 * Adding one is a field in the right interface here, a default below, and an entry in
 * components/inbox/filters.ts for the words. It reaches the page on the profile - see
 * user.api.ts - and the server fills it in for every account saved before it existed, so there
 * is nothing to migrate. The server owns every rule itself - each needs something no browser
 * can see - so nothing about the filtering happens in this file.
 */
export interface InboxBuildFilters {
  includeApproved: boolean;
  recentDrafts: RecentDrafts;
}

export interface InboxViewFilters {
  separateTeam: boolean;
  separateBots: boolean;
  /** `org/slug` keys of your teams that should not count as yours. */
  excludedTeams: string[];
  /** Logins whose pull requests never reach you, lowercased. */
  ignoredAuthors: string[];
}

export type InboxFilters = InboxBuildFilters & InboxViewFilters;

export type InboxFilterKey = keyof InboxFilters;

/** Typed as a window rather than as a `RecentDrafts`, so the default can never be `off`. */
export const DEFAULT_RECENT_DRAFT_WINDOW: RecentDraftWindow = "1d";

export const DEFAULT_BUILD_FILTERS: InboxBuildFilters = {
  includeApproved: false,
  recentDrafts: DEFAULT_RECENT_DRAFT_WINDOW,
};

/**
 * Both headings on, and nothing removed. Every default here is the one that shows the most and
 * assumes the least; the opposite would be an inbox quietly missing rows on a guess.
 */
export const DEFAULT_VIEW_FILTERS: InboxViewFilters = {
  separateTeam: true,
  separateBots: true,
  excludedTeams: [],
  ignoredAuthors: [],
};

/**
 * What somebody who has never touched the settings gets. Kept in step with the server's own
 * defaults, though nothing breaks if they drift: every request sends every filter explicitly,
 * and the set the page runs under comes from the account rather than from here.
 *
 * What these are for is the moment before the account has been read. The page holds these
 * until then and asks for nothing, so a request is never made under settings that are about to
 * be replaced - see inboxSettingsLogic.
 */
export const DEFAULT_INBOX_FILTERS: InboxFilters = {
  ...DEFAULT_BUILD_FILTERS,
  ...DEFAULT_VIEW_FILTERS,
};

/** Each filter's name, taken from the defaults so there is no second list to forget one in. */
export const INBOX_BUILD_FILTER_KEYS = Object.keys(
  DEFAULT_BUILD_FILTERS
) as (keyof InboxBuildFilters)[];

export const INBOX_FILTER_KEYS = Object.keys(
  DEFAULT_INBOX_FILTERS
) as InboxFilterKey[];

/**
 * Setting one filter, with the value typed against the key rather than to `unknown`.
 *
 * Written out as a type because it is generic, and a generic function type cannot be spelled
 * inline in a props interface without losing the tie between the two arguments - which is the
 * only thing stopping `recentDrafts` being set to `true`.
 */
export type InboxFilterChange = <Key extends InboxFilterKey>(
  key: Key,
  value: InboxFilters[Key]
) => void;

/** Whether two sets of choices ask for the same thing. */
export function sameInboxFilters(a: InboxFilters, b: InboxFilters): boolean {
  return INBOX_FILTER_KEYS.every((key) => {
    const left = a[key];
    const right = b[key];

    return Array.isArray(left) && Array.isArray(right)
      ? left.length === right.length && left.every((value, i) => value === right[i])
      : left === right;
  });
}

/**
 * Sent in full on every request rather than only where they differ from the default, so what
 * the page is showing is never a matter of what the two sides happen to agree the default is.
 *
 * Lists go comma-separated rather than as axios's repeated `key[]=` form, which is what the
 * server reads. An empty list sends an empty string, which the server takes as "nobody" - the
 * distinction matters, because "always send everything" is the whole point of this function.
 */
function filterParams(filters: InboxFilters): Record<string, string | boolean> {
  return Object.fromEntries(
    INBOX_FILTER_KEYS.map((key) => {
      const value = filters[key];

      return [key, Array.isArray(value) ? value.join(",") : value];
    })
  );
}

export interface InboxResult {
  /** ISO 8601. Absent only when GitHub has never answered for this user. */
  refreshedAt?: string;
  /**
   * An older snapshot, served because the refresh behind it failed. The rows are real - they
   * were true when GitHub last answered - they are just not current.
   */
  stale: boolean;
  /**
   * The stored GitHub authorization is gone or was revoked. Deliberately not a 401: the proke
   * session is fine, and the interceptors in lib/auth/session.ts read a 401 as a session to renew
   * and then, failing that, to end - which would sign the user out of a working account.
   */
  githubReauthRequired: boolean;
  /**
   * The teams the "your team" grouping is built from, for the settings to list.
   *
   * Three states rather than two. Absent is "not established" - GitHub has not answered yet, or
   * would not say, which is a missing permission as often as an outage. An empty array is "you
   * are in none". They look identical and mean opposite things to whoever is reading the panel.
   */
  teams?: InboxTeam[];
  yours: InboxSectionData[];
  waitingOnYou: InboxSectionData[];
}

function authRequest(jwtToken: string, filters: InboxFilters) {
  return {
    headers: { Authorization: `Bearer ${jwtToken}` },
    params: filterParams(filters),
  };
}

export class InboxApi {
  /**
   * The stored snapshot. One cache lookup on the server - it never calls GitHub, at any age,
   * so this is what the page paints from.
   *
   * The filters go on this one too, and not as decoration: a snapshot is built under one set of
   * them, so asking with different settings is a miss rather than a differently-filtered answer.
   * Which is exactly right - the refresh chained behind this fills it in.
   */
  public static async read(
    jwtToken: string,
    filters: InboxFilters
  ): Promise<InboxResult> {
    const response = await axios.get<InboxResult>(
      "/inbox",
      authRequest(jwtToken, filters)
    );

    return response.data;
  }

  /**
   * Asks GitHub and answers with what it said. Slow by nature - a round trip to another API -
   * which is why it runs behind rows that are already on screen rather than in front of them.
   */
  public static async refresh(
    jwtToken: string,
    filters: InboxFilters
  ): Promise<InboxResult> {
    const response = await axios.post<InboxResult>(
      "/inbox/refresh",
      {},
      authRequest(jwtToken, filters)
    );

    return response.data;
  }
}

/**
 * Where the settings are kept: on the account, and nowhere else.
 *
 * Not in the address bar, which is where they lived before. That kept the page's own URL clean
 * and made a view linkable, and it also meant every fresh open of `/app/inbox` came up on the
 * defaults - so anyone who always wanted approved pull requests shown was living off a bookmark.
 * A setting on the account survives a new tab, a new machine and a deploy, and it is also what
 * the server refreshes the inbox under between visits, so the view somebody actually uses is
 * the one that is warm when they come back.
 *
 * The complete set is sent every time rather than the one that moved, for the same reason the
 * inbox requests send every filter: what is stored is never a matter of what the two sides
 * happen to agree the default is. The answer is the set as the server stored it - lists
 * lowercased and deduplicated - and that answer is what the page ends up showing.
 */
export class InboxSettingsApi {
  public static async update(
    jwtToken: string,
    filters: InboxFilters
  ): Promise<InboxFilters> {
    const response = await axios.put<InboxFilters>("/inbox/settings", filters, {
      headers: { Authorization: `Bearer ${jwtToken}` },
    });

    return response.data;
  }
}
