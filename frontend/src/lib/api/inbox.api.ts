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

export class InboxApi {
  public static async read(jwtToken: string): Promise<InboxResult> {
    const response = await axios.get<InboxResult>("/inbox", {
      headers: { Authorization: `Bearer ${jwtToken}` },
    });

    return response.data;
  }
}
