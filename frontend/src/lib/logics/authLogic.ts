import { actions, kea, listeners, path, reducers, selectors } from "kea";
import { loaders } from "kea-loaders";
import { subscriptions } from "kea-subscriptions";

import { identifyUser, resetUser } from "../analytics/analytics";
import { AuthApi } from "../api/auth.api";
import { UserApi, type User } from "../api/user.api";

import type { authLogicType } from './authLogicType'

export const authLogic = kea<authLogicType>([
  path(["src", "lib", "logics", "authLogic"]),

  actions({
    setLoginError: (loginError: string | null) => ({ loginError }),
    logout: true,
  }),

  reducers({
    jwtToken: [
      null as string | null,
      // Persisted, so a reload keeps you logged in instead of bouncing you back
      // through the OAuth round trip.
      { persist: true },
      {
        // The success case is filled in by the exchangeGithubCodeForJwt loader below.
        logout: () => null,
      },
    ],
    userData: [
      null as User | null,
      {
        logout: () => null,
      },
    ],
    loginError: [
      null as string | null,
      {
        setLoginError: (_, { loginError }) => loginError,
        exchangeGithubCodeForJwt: () => null,
        exchangeGithubCodeForJwtFailure: (_, { error }) =>
          error || "GitHub login failed",
        logout: () => null,
      },
    ],
  }),

  selectors({
    isLoggedIn: [(s) => [s.jwtToken], (jwtToken) => jwtToken !== null],
  }),

  loaders(({ values }) => ({
    jwtToken: {
      exchangeGithubCodeForJwt: async (
        githubCode: string
      ): Promise<string | null> => {
        const result = await AuthApi.loginGithub(githubCode);
        return result.token;
      },
    },
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
    jwtToken: (jwtToken) => {
      if (!jwtToken) {
        return;
      }

      actions.loadUserData();
    },
  })),

  listeners(() => ({
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

    // Or the next person to sign in on this browser inherits this one's identity.
    logout: () => {
      resetUser();
    },
  })),
]);
