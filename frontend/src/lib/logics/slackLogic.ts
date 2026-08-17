import { actions, kea, listeners, path, reducers, selectors } from "kea";
import { loaders } from "kea-loaders";

import { captureEvent } from "../analytics/analytics";
import { SlackApi, type SlackConnection } from "../api/slack.api";
import { authLogic } from "./authLogic";

import type { slackLogicType } from './slackLogicType'

/** Before anything is known. `configured` starts true so the panel never blames the server first. */
const EMPTY: SlackConnection = {
  status: "unlinked",
  connectUrl: "",
  configured: true,
};

/** How long "Sent" stays on the button before it goes back to offering another one. */
const SENT_LINGER_MS = 2500;

export type SlackTestState = "idle" | "sending" | "sent";

/** How far the callback page has got. Failures stop there rather than bouncing home silently. */
export type SlackConnectState = "idle" | "working" | "done" | "failed";

let sentTimeout: ReturnType<typeof setTimeout> | undefined;

export const slackLogic = kea<slackLogicType>([
  path(["src", "lib", "logics", "slackLogic"]),

  actions({
    disconnect: true,
    sendTestPoke: true,
    setActionError: (actionError: string | null) => ({ actionError }),
    setTestState: (testState: SlackTestState) => ({ testState }),
    /** Show the panel as disconnected before the server has confirmed it; null forgets it. */
    setOptimisticDisconnect: (optimistic: boolean) => ({ optimistic }),
  }),

  reducers({
    actionError: [
      null as string | null,
      {
        setActionError: (_, { actionError }) => actionError,
        disconnect: () => null,
        sendTestPoke: () => null,
        connect: () => null,
        connectFailure: (_, { error }) => error,
      },
    ],
    testState: [
      "idle" as SlackTestState,
      {
        setTestState: (_, { testState }) => testState,
        sendTestPoke: () => "sending" as SlackTestState,
        // A different workspace is a different question; do not carry an old tick over.
        connectSuccess: () => "idle" as SlackTestState,
        disconnect: () => "idle" as SlackTestState,
      },
    ],
    optimisticDisconnect: [
      false,
      {
        setOptimisticDisconnect: (_, { optimistic }) => optimistic,
      },
    ],
    connectState: [
      "idle" as SlackConnectState,
      {
        connect: () => "working" as SlackConnectState,
        connectSuccess: () => "done" as SlackConnectState,
        connectFailure: () => "failed" as SlackConnectState,
      },
    ],
  }),

  loaders(() => ({
    result: [
      EMPTY,
      {
        loadConnection: async (): Promise<SlackConnection> => {
          const jwtToken = authLogic.values.jwtToken;

          if (!jwtToken) {
            return EMPTY;
          }

          return SlackApi.read(jwtToken);
        },
        connect: async ({
          code,
          state,
        }: {
          code: string;
          state: string;
        }): Promise<SlackConnection> => {
          const jwtToken = authLogic.values.jwtToken;

          if (!jwtToken) {
            return EMPTY;
          }

          try {
            return await SlackApi.connect(jwtToken, code, state);
          } catch (error: any) {
            // The loader's failure action only carries `error.message`, and axios puts
            // "Request failed with status code 400" there. The server's sentence is the
            // useful one - it is the only thing that says what to do next.
            throw new Error(
              error?.response?.data?.message ?? "Slack turned that authorization down"
            );
          }
        },
      },
    ],
  })),

  selectors({
    /**
     * The server's answer, with a disconnect shown before it has landed. The connect URL is
     * kept: it is the button the panel is about to need, and it is valid either way.
     */
    connection: [
      (s) => [s.result, s.optimisticDisconnect],
      (
        result: SlackConnection,
        optimisticDisconnect: boolean
      ): SlackConnection =>
        optimisticDisconnect
          ? {
              status: "unlinked",
              connectUrl: result.connectUrl,
              configured: result.configured,
            }
          : result,
    ],
  }),

  listeners(({ actions, values, asyncActions }) => ({
    /**
     * Instant, then confirmed. The write is short and the refetch behind it is what supplies
     * the fresh single-use state for the next authorize URL, so the panel cannot be left
     * holding a spent one.
     */
    disconnect: async () => {
      const jwtToken = authLogic.values.jwtToken;

      if (!jwtToken) {
        return;
      }

      // Intent only, here and in sendTestPoke below. The outcome of both is the server's to
      // report - backend_slack_disconnected, and backend_poke_sent/dropped for the test.
      captureEvent("slack_disconnect_clicked");

      actions.setOptimisticDisconnect(true);

      try {
        await SlackApi.disconnect(jwtToken);
      } catch (error: any) {
        actions.setOptimisticDisconnect(false);
        actions.setActionError(
          error?.response?.data?.message ?? "Could not disconnect Slack"
        );

        return;
      }

      // Fetch first, forget second: dropping the pretence before the truth is in would flash
      // the old workspace back for the length of the request.
      await asyncActions.loadConnection();

      if (values.result.status === "unlinked") {
        actions.setOptimisticDisconnect(false);
      }
    },

    sendTestPoke: async () => {
      const jwtToken = authLogic.values.jwtToken;

      if (!jwtToken) {
        return;
      }

      captureEvent("slack_test_poke_clicked");

      clearTimeout(sentTimeout);

      try {
        await SlackApi.sendTestPoke(jwtToken);
      } catch (error: any) {
        actions.setTestState("idle");
        actions.setActionError(
          error?.response?.data?.message ?? "Could not send a test poke"
        );

        return;
      }

      actions.setTestState("sent");
      sentTimeout = setTimeout(() => actions.setTestState("idle"), SENT_LINGER_MS);
    },
  })),
]);
