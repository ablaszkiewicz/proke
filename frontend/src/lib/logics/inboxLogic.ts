import { kea, path } from "kea";
import { loaders } from "kea-loaders";

import { InboxApi, type InboxResult } from "../api/inbox.api";
import { authLogic } from "./authLogic";

import type { inboxLogicType } from './inboxLogicType'

/**
 * Every section, empty. What the page renders before the first answer arrives and after a
 * failure - the headings are stable either way, so nothing reshuffles underneath the reader.
 */
const EMPTY: InboxResult = {
  stale: false,
  githubReauthRequired: false,
  yours: [],
  waitingOnYou: [],
};

export const inboxLogic = kea<inboxLogicType>([
  path(["src", "lib", "logics", "inboxLogic"]),

  loaders(() => ({
    result: [
      EMPTY,
      {
        loadInbox: async (): Promise<InboxResult> => {
          const jwtToken = authLogic.values.jwtToken;

          if (!jwtToken) {
            return EMPTY;
          }

          return InboxApi.read(jwtToken);
        },
      },
    ],
  })),
]);
