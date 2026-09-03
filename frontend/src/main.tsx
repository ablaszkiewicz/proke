import "@fontsource-variable/funnel-display";
import "./index.css";

import { PostHogProvider } from "@posthog/react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import axios from "axios";
import { resetContext } from "kea";
import { loadersPlugin } from "kea-loaders";
import { localStoragePlugin } from "kea-localstorage";
import { subscriptionsPlugin } from "kea-subscriptions";
import posthog from "posthog-js";
import ReactDOM from "react-dom/client";

import { initAnalytics } from "./lib/analytics/analytics";
import {
  installAuthInterceptors,
  startSessionRenewal,
} from "./lib/auth/session";
import { authLogic } from "./lib/logics/authLogic";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });

// Before anything renders and before any logic mounts, so that by the time a component or a kea
// listener can capture something, the library is up. It is what lets the logics import the
// analytics wrapper at module level - see lib/analytics/analytics.ts. No-ops without a key.
initAnalytics();

resetContext({
  plugins: [
    loadersPlugin,
    subscriptionsPlugin,
    localStoragePlugin({
      storageEngine: window.localStorage,
      prefix: "proke-app",
      separator: "_",
    }),
  ],
});

axios.defaults.baseURL = import.meta.env.VITE_API_URL;

// Strictly before authLogic is mounted. Mounting it fetches the profile there and then - the
// subscription on being logged in fires immediately for a session read out of local storage - and
// that first request is exactly the one most likely to be carrying an hour-old access token. It
// has to go through the interceptor that renews it.
//
// A dead access token used to end the session. It now renews it instead, and only a session the
// server will not renew falls back to the login button. See lib/auth/session.ts.
installAuthInterceptors();

// Mounted here rather than left to the router, so the interceptors and the clock below can read
// the stored session from the moment the app starts rather than from the first render. The
// router mounts it again a moment later; kea counts mounts.
authLogic.mount();

// The part that means a tab left open all day, or a laptop shut and reopened tomorrow, comes
// back to a working session rather than to the login screen.
startSessionRenewal();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(
    // So components can reach PostHog through usePostHog() rather than the singleton. The
    // provider renders its children whether or not init ran, so a missing key costs nothing.
    <PostHogProvider client={posthog}>
      <RouterProvider router={router} />
    </PostHogProvider>
  );
}
