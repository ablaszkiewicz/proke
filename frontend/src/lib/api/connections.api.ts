import axios from "axios";

export type ConnectionStatus = "subscribed" | "available" | "suspended";

export type NotificationType =
  | "review_requested"
  | "review_submitted"
  | "pull_request_merged"
  | "pull_request_comment"
  | "comment_reply"
  | "pull_request_mention"
  | "issue_mention"
  | "team_mention";

export interface RepositoryPreference {
  repositoryId: string;
  repositoryFullName?: string;
  enabled: boolean;
  /** Omitted means the installation-wide list applies. */
  notificationTypes?: NotificationType[];
}

/**
 * Richer than anything the UI exposes today. The backend can already express "only these
 * repos, and only merges on that one"; the settings panel just renders the defaults read-only
 * until there is a picker worth building.
 */
export interface NotificationPreferences {
  repositoryScope: "all" | "selected";
  notificationTypes: NotificationType[];
  repositories: RepositoryPreference[];
}

/**
 * What the signed-in user is to the account an installation sits on. Owner is whoever can
 * remove the app for everybody; anyone a colleague shared a single repository with is a member.
 */
export type ViewerRole = "owner" | "member";

export interface AccessibleRepository {
  repositoryId: string;
  fullName: string;
  private: boolean;
}

export interface Connection {
  installationId: string;
  accountLogin: string;
  accountType: "User" | "Organization";
  status: ConnectionStatus;
  /**
   * What the installer granted the app - the same string for everybody who can see the
   * installation, so it says nothing about this user. `repositoryCount` is the one to render.
   */
  repositorySelection?: "all" | "selected";
  /** Absent when GitHub would not say - the app may lack the Members permission. */
  viewerRole?: ViewerRole;
  /**
   * How many repositories this user reaches through the installation. Absent when GitHub could
   * not be asked, which is not the same as zero - fall back to `repositorySelection` then.
   */
  repositoryCount?: number;
  /** Up to the first hundred by name, so shorter than `repositoryCount` on a large account. */
  repositories?: AccessibleRepository[];
  manageUrl: string;
  /** Present only while subscribed - preferences are what an opt-in contains. */
  preferences?: NotificationPreferences;
}

export interface ConnectionsResult {
  connections: Connection[];
  installUrl: string;
  /**
   * True when proke holds no usable GitHub authorization - never granted, or revoked since. The
   * list is empty because it could not be read, not because it is empty, and the fix is to sign
   * in with GitHub again.
   *
   * Deliberately not a 401: the proke session is fine, and the interceptor in main.tsx treats a
   * 401 as a dead session and signs the user out of a working account. Nothing renders this yet
   * - the dashboard still shows an empty list.
   */
  githubReauthRequired?: boolean;
}

function authHeaders(jwtToken: string) {
  return { headers: { Authorization: `Bearer ${jwtToken}` } };
}

export class ConnectionsApi {
  public static async list(jwtToken: string): Promise<ConnectionsResult> {
    const response = await axios.get<ConnectionsResult>(
      "/connections",
      authHeaders(jwtToken)
    );

    return response.data;
  }

  public static async subscribe(
    jwtToken: string,
    installationId: string
  ): Promise<void> {
    await axios.post(
      `/connections/${installationId}/subscription`,
      {},
      authHeaders(jwtToken)
    );
  }

  public static async unsubscribe(
    jwtToken: string,
    installationId: string
  ): Promise<void> {
    await axios.delete(
      `/connections/${installationId}/subscription`,
      authHeaders(jwtToken)
    );
  }

  /**
   * Replaces what this user wants out of an installation. Unused by the UI so far - the panel
   * is read-only - but the endpoint is the one a repo picker will call.
   */
  public static async updatePreferences(
    jwtToken: string,
    installationId: string,
    preferences: NotificationPreferences
  ): Promise<NotificationPreferences> {
    const response = await axios.put<NotificationPreferences>(
      `/connections/${installationId}/preferences`,
      preferences,
      authHeaders(jwtToken)
    );

    return response.data;
  }

  /** Removes the app from the account for everyone. Owners only; the backend enforces it. */
  public static async uninstall(
    jwtToken: string,
    installationId: string
  ): Promise<void> {
    await axios.delete(`/connections/${installationId}`, authHeaders(jwtToken));
  }
}
