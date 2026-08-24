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
 * force cannot be written down - not here, not on the wire, and not in the address bar.
 */
export type RecentDrafts = RecentDraftWindow | "off";

export const RECENT_DRAFTS_VALUES: readonly RecentDrafts[] = [
  "off",
  ...RECENT_DRAFT_WINDOWS,
];

/**
 * Every filter, in the order they are drawn, and the shape the server takes them in.
 *
 * The names read as what they *include* rather than what they hide, which is the only way a
 * toggle can be labelled without a double negative under it.
 *
 * Adding one is a field here, a default below, an entry in components/inbox/filters.ts for the
 * words, and a line in components/inbox/search.ts for the address bar. The server owns the rule
 * itself - "already approved" needs GitHub's review decision, and "touched in the last six
 * hours" needs GitHub's `updatedAt`, neither of which a browser can see - so nothing about the
 * filtering happens in this file.
 */
export interface InboxFilters {
  includeApproved: boolean;
  recentDrafts: RecentDrafts;
}

export type InboxFilterKey = keyof InboxFilters;

/** Typed as a window rather than as a `RecentDrafts`, so the default can never be `off`. */
export const DEFAULT_RECENT_DRAFT_WINDOW: RecentDraftWindow = "1d";

/**
 * What somebody who has never touched the settings gets. Kept in step with the server's own
 * defaults, though nothing breaks if they drift: every request sends every filter explicitly.
 *
 * It is also what decides how short the address bar is. Only settings that differ from these
 * are written into it - see components/inbox/search.ts - so the page as it comes is `/app/inbox`
 * and nothing more.
 */
export const DEFAULT_INBOX_FILTERS: InboxFilters = {
  includeApproved: false,
  recentDrafts: DEFAULT_RECENT_DRAFT_WINDOW,
};

/** Every filter's name, taken from the defaults so there is no second list to forget one in. */
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
  return INBOX_FILTER_KEYS.every((key) => a[key] === b[key]);
}

/**
 * Sent in full on every request rather than only where they differ from the default, so what
 * the page is showing is never a matter of what the two sides happen to agree the default is.
 */
function filterParams(filters: InboxFilters): Record<string, string | boolean> {
  return Object.fromEntries(INBOX_FILTER_KEYS.map((key) => [key, filters[key]]));
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
   * session is fine, and the interceptor in main.tsx reads a 401 as a dead session and signs
   * the user out of a working account.
   */
  githubReauthRequired: boolean;
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
