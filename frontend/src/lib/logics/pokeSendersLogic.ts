import { connect, kea, path, reducers } from "kea";
import { loaders } from "kea-loaders";

import { PokeSendersApi, type PokeSenders } from "../api/user.api";
import { authLogic } from "./authLogic";

import type { pokeSendersLogicType } from './pokeSendersLogicType'

/**
 * Who has been proking this account lately, for the bots dialog to suggest from.
 *
 * Read once when the dashboard opens rather than when the dialog does, so the suggestions are
 * there on the dialog's first frame instead of arriving under it a moment later. Nothing here is
 * ever written: the counting is the server's, done as the prokes go out.
 *
 * A failed read is an empty list rather than an error on screen. Suggestions are a shortcut to
 * typing a login, and the field they sit under works without them.
 */
export const pokeSendersLogic = kea<pokeSendersLogicType>([
  path(["src", "lib", "logics", "pokeSendersLogic"]),

  connect(() => ({
    actions: [authLogic, ["logout"]],
  })),

  loaders(() => ({
    senders: [
      null as PokeSenders | null,
      {
        loadSenders: async (): Promise<PokeSenders | null> => {
          const jwtToken = authLogic.values.jwtToken;

          if (!jwtToken) {
            return null;
          }

          try {
            return await PokeSendersApi.read(jwtToken);
          } catch {
            return null;
          }
        },
      },
    ],
  })),

  reducers({
    senders: [
      null as PokeSenders | null,
      {
        // Or the next person to sign in on this browser is offered this one's bots.
        logout: () => null,
      },
    ],
  }),
]);
