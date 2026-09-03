import axios, {
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";

import { AuthApi } from "../api/auth.api";
import { authLogic } from "../logics/authLogic";

/**
 * Keeping the session alive, from the browser's side.
 *
 * The access token now lasts an hour rather than a week, which is only bearable because nobody
 * ever has to notice. Three things make sure of that, in order of how much the user would feel
 * them:
 *
 *   1. A clock. Every so often - and whenever the tab comes back to life - the token is renewed
 *      if it is close to expiring. This is the one that does the work: it happens while nothing
 *      is waiting on it.
 *   2. A check before each request, so a request that would have gone out with a token about to
 *      expire waits for a new one instead.
 *   3. A retry after a 401, for the cases the first two cannot cover - a clock that jumped, a
 *      token revoked mid-session.
 *
 * Only the third existed before, and it did not refresh: it signed you out.
 */

/**
 * Renew when less than this is left. Comfortably longer than any request takes, so a token that
 * passes the check at the start of a request is still valid when the server reads it - and long
 * enough to absorb a few minutes of clock skew between this browser and the backend.
 */
const RENEW_WHEN_REMAINING_MS = 5 * 60_000;

/**
 * How often the clock looks. Far more often than a token expires, because what it is really
 * watching for is the tab having been asleep - and it costs a comparison when there is nothing
 * to do.
 */
const CHECK_INTERVAL_MS = 60_000;

/**
 * Marks a request that has already been retried once, so a 401 loop cannot form.
 *
 * The mark has to survive the retry, which is not free: retrying goes through axios.request,
 * and that rebuilds the config with mergeConfig rather than reusing the object. A plain string
 * key is the shape mergeConfig has always carried across - it copies unknown properties onto the
 * new config - and it shows up in a logged config, which a symbol would not.
 */
const RETRIED = "__prokeAuthRetried";

type RetriableConfig = InternalAxiosRequestConfig & { [RETRIED]?: boolean };

/**
 * The one refresh in flight, if any.
 *
 * The dashboard fires several requests the moment it opens. Without this, each of them arriving
 * at a token about to expire would start its own renewal - the same call several times over,
 * each one dispatching its own setSession. They would all succeed, since refresh tokens are not
 * rotated, so this is about not doing five times the work rather than about avoiding a race.
 */
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Returns an access token good for the next few minutes, renewing first if it is not.
 *
 * Null only when there is nothing to renew with: a signed-out browser, or a session stored
 * before refresh tokens existed. Callers treat that as "carry on with what you have" - the
 * server is the one that decides whether a token still works.
 */
export async function ensureFreshAccessToken(): Promise<string | null> {
  const { jwtToken, refreshToken, accessTokenExpiresAt } = authLogic.values;

  if (!refreshToken) {
    return jwtToken;
  }

  // No expiry recorded means a session from before this shipped, or one whose token we cannot
  // reason about. Renew it and get an expiry we can.
  if (
    accessTokenExpiresAt !== null &&
    accessTokenExpiresAt - Date.now() > RENEW_WHEN_REMAINING_MS
  ) {
    return jwtToken;
  }

  return refreshSession();
}

/** Renews now, or joins the renewal already happening. Null means the session has ended. */
export function refreshSession(): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const refreshToken = authLogic.values.refreshToken;

  if (!refreshToken) {
    return Promise.resolve(null);
  }

  refreshInFlight = AuthApi.refresh(refreshToken)
    .then((session) => {
      authLogic.actions.setSession(session);
      return session.token;
    })
    // Every failure is the same failure from here: we could not renew, so the caller should
    // stop trying. Whether that was a revoked session or a dead network is the difference
    // between signing out now and signing out on the next 401, and neither is worth branching
    // on - the request that follows settles it.
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/**
 * Requests to /auth/* carry their own credentials in the body and must never be caught by any of
 * this - refreshing inside the refresh call is how an infinite loop starts.
 */
function isAuthRoute(url: string | undefined): boolean {
  return (url ?? "").includes("/auth/");
}

/**
 * Whether this request was speaking for somebody. Read through AxiosHeaders' own accessors where
 * they exist, so the check is case-insensitive the way HTTP is - a config assembled by hand is
 * the only thing that arrives as a plain object.
 */
function hasBearer(config: InternalAxiosRequestConfig): boolean {
  const headers = config.headers;

  if (!headers) {
    return false;
  }

  if (typeof headers.get === "function") {
    return Boolean(headers.get("Authorization"));
  }

  return Boolean((headers as Record<string, unknown>).Authorization);
}

function withBearer(
  config: InternalAxiosRequestConfig,
  token: string
): InternalAxiosRequestConfig {
  if (typeof config.headers?.set === "function") {
    config.headers.set("Authorization", `Bearer ${token}`);
  } else {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    } as InternalAxiosRequestConfig["headers"];
  }

  return config;
}

/**
 * Teaches axios to keep the session fresh. Called once, from main.tsx, before anything renders.
 *
 * Every API module already sets its own `Authorization` header from the token authLogic held
 * when the call was made. Rewriting that header here - rather than asking each of them to fetch
 * a fresh token first - is what lets a renewal be invisible to all of them.
 */
export function installAuthInterceptors(): void {
  axios.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    if (isAuthRoute(config.url)) {
      return config;
    }

    // Only requests that were already authenticated. A public one has no session to speak for
    // and must not be made to wait on a renewal.
    if (!hasBearer(config)) {
      return config;
    }

    const token = await ensureFreshAccessToken();

    // A failed renewal falls through with the old token. It will very likely 401, and the
    // response interceptor below is what turns that into a sign-out.
    return token ? withBearer(config, token) : config;
  });

  axios.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error) => {
      const config = error.config as RetriableConfig | undefined;

      if (
        error.response?.status !== 401 ||
        !config ||
        // /auth/refresh answering 401 means the session is over, and /auth/github/login
        // answering it is a login being refused. Neither is retryable.
        isAuthRoute(config.url)
      ) {
        return Promise.reject(error);
      }

      // Second 401 on the same request, with a token minted moments ago: this is not about the
      // token. Sign out rather than renew again, or the two keep handing work to each other.
      if (config[RETRIED]) {
        authLogic.actions.logout();
        return Promise.reject(error);
      }

      const token = await refreshSession();

      if (!token) {
        // Nothing left to renew with - a revoked session, a deleted account, or a token old
        // enough to have lapsed. Drop it so the UI falls back to the login button instead of
        // looping on 401s.
        authLogic.actions.logout();
        return Promise.reject(error);
      }

      config[RETRIED] = true;

      return axios.request(withBearer(config, token));
    }
  );
}

/**
 * Starts the clock: the part that means somebody who leaves proke open all day, or shuts the lid
 * and opens it tomorrow, never sees a request fail on their behalf.
 *
 * Only while the tab is visible. A backgrounded tab renewing on a timer is work nobody is
 * waiting for, and the visibility handler catches it up the instant it is looked at again -
 * which is also the moment a laptop coming out of sleep gets a fresh token, before the page has
 * asked for anything.
 */
export function startSessionRenewal(): void {
  const renewIfNeeded = () => {
    if (document.visibilityState === "hidden") {
      return;
    }

    void ensureFreshAccessToken();
  };

  window.setInterval(renewIfNeeded, CHECK_INTERVAL_MS);

  document.addEventListener("visibilitychange", renewIfNeeded);
  // Coming back from a sleeping laptop or a dead connection. Both fire on paths
  // `visibilitychange` does not, and the check is cheap enough that overlapping is free.
  window.addEventListener("focus", renewIfNeeded);
  window.addEventListener("online", renewIfNeeded);

  renewIfNeeded();
}
