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
 * Every filter, in the order they are drawn, and the shape the server takes them in.
 *
 * The names read as what they *include* rather than what they hide, which is the only way a
 * toggle can be labelled without a double negative under it.
 *
 * Adding one is a name here, a default below, and an entry in components/inbox/filters.ts for
 * the words. The server owns the rule itself - "already approved" needs GitHub's review
 * decision, which no browser can see - so nothing about the filtering happens in this file.
 */
export const INBOX_FILTER_KEYS = ["includeApproved"] as const;

export type InboxFilterKey = (typeof INBOX_FILTER_KEYS)[number];

export type InboxFilters = { [Key in InboxFilterKey]: boolean };

/**
 * What somebody who has never opened the settings gets. Kept in step with the server's own
 * defaults, though nothing breaks if they drift: every request sends every filter explicitly.
 */
export const DEFAULT_INBOX_FILTERS: InboxFilters = {
  includeApproved: false,
};

/**
 * Sent in full on every request rather than only where they differ from the default, so what
 * the page is showing is never a matter of what the two sides happen to agree the default is.
 */
function filterParams(filters: InboxFilters): Record<string, boolean> {
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
