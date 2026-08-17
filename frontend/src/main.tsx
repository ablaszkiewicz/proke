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

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // A dead token is the common case here - drop it so the UI falls back to
    // the login button instead of looping on 401s.
    if (error.response?.status === 401) {
      authLogic.findMounted()?.actions.logout();
    }

    return Promise.reject(error);
  }
);

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
