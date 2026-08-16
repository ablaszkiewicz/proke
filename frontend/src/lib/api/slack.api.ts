import axios from "axios";

/**
 * Connecting Slack is two acts by two different people, and this says which is outstanding.
 * Only the first person in a workspace ever sees `workspace_missing`.
 */
export type SlackConnectionStatus = "unlinked" | "workspace_missing" | "linked";

export interface SlackConnection {
  status: SlackConnectionStatus;
  teamId?: string;
  teamName?: string;
  slackHandle?: string;
  /** Sign in with Slack. Identity only, so no workspace admin is involved. */
  connectUrl: string;
  /** Only when the workspace still needs the app added. */
  installUrl?: string;
  /** False when the server has no Slack credentials - the UI says so rather than failing. */
  configured: boolean;
}

function authHeaders(jwtToken: string) {
  return { headers: { Authorization: `Bearer ${jwtToken}` } };
}

export class SlackApi {
  public static async read(jwtToken: string): Promise<SlackConnection> {
    const response = await axios.get<SlackConnection>(
      "/slack/connection",
      authHeaders(jwtToken)
    );

    return response.data;
  }

  /** Spends the code Slack put on the redirect. Both authorize flows come back through here. */
  public static async connect(
    jwtToken: string,
    code: string,
    state: string
  ): Promise<SlackConnection> {
    const response = await axios.post<SlackConnection>(
      "/slack/connection",
      { code, state },
      authHeaders(jwtToken)
    );

    return response.data;
  }

  /** Drops this person's identity only; the workspace install belongs to everyone using it. */
  public static async disconnect(jwtToken: string): Promise<void> {
    await axios.delete("/slack/connection", authHeaders(jwtToken));
  }

  public static async sendTestPoke(jwtToken: string): Promise<void> {
    await axios.post("/slack/connection/test", {}, authHeaders(jwtToken));
  }
}
