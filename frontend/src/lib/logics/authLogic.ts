import { actions, kea, listeners, path, reducers, selectors } from "kea";
import { loaders } from "kea-loaders";
import { subscriptions } from "kea-subscriptions";

import { identifyUser, resetUser } from "../analytics/analytics";
import { AuthApi, type Session } from "../api/auth.api";
import { UserApi, type User } from "../api/user.api";

import type { authLogicType } from './authLogicType'

export const authLogic = kea<authLogicType>([
  path(["src", "lib", "logics", "authLogic"]),

  actions({
    exchangeGithubCodeForJwt: (githubCode: string) => ({ githubCode }),
    /**
     * A session arrived - from logging in, or from a refresh. One action for both, because the
     * two produce the same thing and everything downstream should treat them the same.
     */
    setSession: (session: Session) => ({ session }),
    setLoginError: (loginError: string | null) => ({ loginError }),
    /** Sign out. Ends the session on the server too - see the listener. */
    logout: true,
    /**
     * Forget the session locally. Split from `logout` for one reason: the listener needs to read
     * the refresh token in order to revoke it, and reducers have already run by the time a
     * listener sees the action that fired them.
     */
    clearSession: true,
  }),

  reducers({
    jwtToken: [
      null as string | null,
      // Persisted, so a reload keeps you logged in instead of bouncing you back
      // through the OAuth round trip.
      { persist: true },
      {
        setSession: (_, { session }) => session.token,
        clearSession: () => null,
      },
    ],
    /**
     * The long half of the session, and the only part that survives the access token expiring.
     *
     * Persisted next to the access token rather than in a cookie: proke's frontend and backend
     * are separate origins, so an httpOnly cookie would mean CORS credentials and a shared
     * parent domain, and the access token has always lived here anyway. What the pair buys is
     * not a safer hiding place - it is that the durable half is revocable and the one sent on
     * every request lasts an hour.
     */
    refreshToken: [
      null as string | null,
      { persist: true },
      {
        setSession: (_, { session }) => session.refreshToken,
        clearSession: () => null,
      },
    ],
    /**
     * When the access token stops working, as a wall-clock moment.
     *
     * Stored as a moment rather than the duration the server sent, because the interesting
     * question is asked much later than the answer arrived - on waking a laptop, say, where a
     * remembered "3600 seconds" would be a lie and a remembered timestamp is still true.
     *
     * Null for a session persisted before any of this existed. Those have no refresh token
     * either, so they simply run until the server stops accepting them.
     */
    accessTokenExpiresAt: [
      null as number | null,
      { persist: true },
      {
        setSession: (_, { session }) => Date.now() + session.expiresIn * 1000,
        clearSession: () => null,
      },
    ],
    userData: [
      null as User | null,
      {
        clearSession: () => null,
      },
    ],
    loginError: [
      null as string | null,
      {
        setLoginError: (_, { loginError }) => loginError,
        exchangeGithubCodeForJwt: () => null,
        setSession: () => null,
        clearSession: () => null,
      },
    ],
  }),

  selectors({
    isLoggedIn: [(s) => [s.jwtToken], (jwtToken) => jwtToken !== null],
  }),

  loaders(({ values }) => ({
    userData: {
      loadUserData: async (): Promise<User | null> => {
        if (!values.jwtToken) {
          return null;
        }

        return UserApi.getMe(values.jwtToken);
      },
    },
  })),

  subscriptions(({ actions }) => ({
    // On being logged in, not on the token itself. A refresh replaces the access token roughly
    // once an hour and changes nothing about who is signed in, so watching the token would buy
    // a profile fetch nobody asked for every time one came back.
    isLoggedIn: (isLoggedIn) => {
      if (!isLoggedIn) {
        return;
      }

      actions.loadUserData();
    },
  })),

  listeners(({ values, actions }) => ({
    exchangeGithubCodeForJwt: async ({ githubCode }) => {
      try {
        actions.setSession(await AuthApi.loginGithub(githubCode));
      } catch (error) {
        actions.setLoginError(
          error instanceof Error ? error.message : "GitHub login failed"
        );
      }
    },

    /**
     * Where the browser's events and the server's become one person's.
     *
     * The id is proke's own, the same value every backend event is captured against, so this
     * is what stops a sign-in reading as two people. It happens here rather than at login
     * because the login response is only a token - the id arrives with the profile.
     *
     * Anything captured before this on the landing page keeps its anonymous id and is folded
     * in by identify, so the first pageview is not lost.
     */
    loadUserDataSuccess: ({ userData }) => {
      if (userData) {
        identifyUser(userData);
      }
    },

    logout: () => {
      // Read before clearing, which is the whole reason these are two actions.
      const refreshToken = values.refreshToken;

      actions.clearSession();
      // Or the next person to sign in on this browser inherits this one's identity.
      resetUser();

      // Not awaited and not surfaced: this browser is signed out either way, and the only thing
      // a failure costs is a token that lapses on its own instead of being deleted now.
      if (refreshToken) {
        void AuthApi.logout(refreshToken).catch(() => undefined);
      }
    },
  })),
]);
