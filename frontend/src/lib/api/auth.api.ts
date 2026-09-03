import axios from "axios";

/**
 * A session as the backend hands it over - the same shape from logging in and from refreshing,
 * so there is one thing to store either way.
 */
export interface Session {
  /** Sent as a bearer token on every request. Short-lived; see `expiresAt` in authLogic. */
  token: string;
  /**
   * Spent at /auth/refresh and nowhere else. Long-lived and revocable, which is the pair's whole
   * point: the token that opens doors expires within the hour, and the token that outlives that
   * is one the server can delete.
   */
  refreshToken: string;
  /** Seconds the access token has left, from now. Turned into a wall-clock moment on arrival. */
  expiresIn: number;
}

/** Everything under here is unauthenticated, and the interceptors leave it alone. See session.ts. */
export const AUTH_ROUTE_PREFIX = "/auth/";

export class AuthApi {
  public static async loginGithub(githubCode: string): Promise<Session> {
    try {
      const response = await axios.post("/auth/github/login", { githubCode });

      return readSession(response.data);
    } catch (error) {
      // Some logins are refused on purpose - an expired code, missing app credentials - and
      // the backend says which. Axios' own "Request failed with status code 400" would throw
      // that away and leave the screen showing something the reader cannot act on.
      throw new Error(readLoginError(error));
    }
  }

  /**
   * Trades the refresh token for a new access token.
   *
   * Throws on a dead session, which is the caller's cue to sign the person out - see
   * refreshSession in session.ts. The refresh token comes back unchanged today, but it is read
   * from the response rather than assumed, so the client keeps working if the server ever starts
   * rotating them.
   */
  public static async refresh(refreshToken: string): Promise<Session> {
    const response = await axios.post("/auth/refresh", { refreshToken });

    return readSession(response.data);
  }

  /**
   * Ends the session server-side, so the refresh token cannot be spent again by whatever might
   * still have a copy of it.
   *
   * Best-effort by design: the browser has already forgotten the session by the time this
   * resolves, and there is nothing useful to do about a failure - see the logout listener.
   */
  public static async logout(refreshToken: string): Promise<void> {
    await axios.post("/auth/logout", { refreshToken });
  }
}

function readSession(data: Session): Session {
  return {
    token: data.token,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
  };
}

function readLoginError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "GitHub login failed";
  }

  const message = error.response?.data?.message;

  // Nest answers with a string for most failures and an array for validation ones.
  if (Array.isArray(message)) {
    return message.join(", ");
  }

  if (typeof message === "string" && message.length > 0) {
    return message;
  }

  return "GitHub login failed";
}
