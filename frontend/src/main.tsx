import "@fontsource-variable/funnel-display";
import "./index.css";

import { createRouter, RouterProvider } from "@tanstack/react-router";
import axios from "axios";
import { resetContext } from "kea";
import { loadersPlugin } from "kea-loaders";
import { localStoragePlugin } from "kea-localstorage";
import { subscriptionsPlugin } from "kea-subscriptions";
import ReactDOM from "react-dom/client";

import { authLogic } from "./lib/logics/authLogic";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });

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
  ReactDOM.createRoot(rootElement).render(<RouterProvider router={router} />);
}
