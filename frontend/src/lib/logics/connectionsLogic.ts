import { actions, kea, listeners, path, reducers, selectors } from "kea";
import { loaders } from "kea-loaders";

import { captureEvent } from "../analytics/analytics";
import {
  ConnectionsApi,
  type Connection,
  type ConnectionStatus,
  type ConnectionsResult,
} from "../api/connections.api";
import { authLogic } from "./authLogic";

import type { connectionsLogicType } from "./connectionsLogicType";

const EMPTY: ConnectionsResult = { connections: [], installUrl: "" };

/**
 * Which toggle is the most recent per installation. Two quick clicks on one row leave two
 * writes in flight, and the slower one landing last must not clear the pretence the newer one
 * put there.
 */
const latestToggle = new Map<string, number>();
let toggleCounter = 0;

export const connectionsLogic = kea<connectionsLogicType>([
  path(["src", "lib", "logics", "connectionsLogic"]),

  actions({
    subscribe: (installationId: string) => ({ installationId }),
    unsubscribe: (installationId: string) => ({ installationId }),
    uninstall: (installationId: string) => ({ installationId }),
    setActionError: (actionError: string | null) => ({ actionError }),
    setPending: (installationId: string, pending: boolean) => ({
      installationId,
      pending,
    }),
    /** Show an installation as `status` before the server has confirmed it; null forgets it. */
    setOptimisticStatus: (
      installationId: string,
      status: ConnectionStatus | null
    ) => ({ installationId, status }),
  }),

  reducers({
    // Surfaced inline: the common failure is "you are not an owner", which the user can do
    // nothing about and should not have to read in a console.
    actionError: [
      null as string | null,
      {
        setActionError: (_, { actionError }) => actionError,
        uninstall: () => null,
      },
    ],
    // Per-row, so one slow request does not put every button in a loading state. Only removal
    // uses this now - turning an account on or off shows its result immediately instead.
    pendingIds: [
      [] as string[],
      {
        setPending: (state, { installationId, pending }) =>
          pending
            ? [...state, installationId]
            : state.filter((id) => id !== installationId),
      },
    ],
    /**
     * What a row is being shown as while its write is in flight. Kept beside the server's
     * answer rather than written into it, so a refetch cannot wipe it and a failure is undone
     * by forgetting one key.
     */
    optimisticStatus: [
      {} as Record<string, ConnectionStatus>,
      {
        setOptimisticStatus: (state, { installationId, status }) => {
          if (status === null) {
            const next = { ...state };
            delete next[installationId];
            return next;
          }

          return { ...state, [installationId]: status };
        },
      },
    ],
  }),

  loaders(() => ({
    result: [
      EMPTY,
      {
        loadConnections: async (): Promise<ConnectionsResult> => {
          const jwtToken = authLogic.values.jwtToken;

          if (!jwtToken) {
            return EMPTY;
          }

          return ConnectionsApi.list(jwtToken);
        },
      },
    ],
  })),

  selectors({
    connections: [
      (s) => [s.result, s.optimisticStatus],
      (
        result: ConnectionsResult,
        optimisticStatus: Record<string, ConnectionStatus>
      ): Connection[] =>
        result.connections.map((connection) => {
          const status = optimisticStatus[connection.installationId];

          if (!status || status === connection.status) {
            return connection;
          }

          // Preferences are what an opt-in contains, so they go out with it. On the way in
          // they stay unknown until the server sends the real ones - nothing reads them yet.
          return status === "subscribed"
            ? { ...connection, status }
            : { ...connection, status, preferences: undefined };
        }),
    ],
    installUrl: [
      (s) => [s.result],
      (result: ConnectionsResult): string => result.installUrl,
    ],
  }),

  listeners(({ actions, values, asyncActions }) => {
    /**
     * A toggle the row shows at once: flip it locally, write, then hand back to the server's
     * answer. The write is short and nearly always succeeds, and waiting on it - then on the
     * refetch behind it - left the row sitting on its old state long after the click.
     */
    const toggle = async (
      installationId: string,
      status: ConnectionStatus,
      write: (jwtToken: string) => Promise<void>,
      failureMessage: string
    ) => {
      const jwtToken = authLogic.values.jwtToken;

      if (!jwtToken) {
        return;
      }

      const token = ++toggleCounter;
      latestToggle.set(installationId, token);

      actions.setActionError(null);
      actions.setOptimisticStatus(installationId, status);

      try {
        await write(jwtToken);
      } catch (error: any) {
        // Superseded by a later click: that one owns the row now, and undoing this write's
        // pretence would show its result instead.
        if (latestToggle.get(installationId) === token) {
          actions.setOptimisticStatus(installationId, null);
          actions.setActionError(
            error?.response?.data?.message ?? failureMessage
          );
        }

        return;
      }

      // Fetch first, forget second. Dropping the pretence before the truth is in would flash
      // the row back through its old state for the length of the request.
      await asyncActions.loadConnections();

      if (latestToggle.get(installationId) !== token) {
        return;
      }

      // Only hand back once the list agrees. A refetch that failed leaves the previous one in
      // place, and forgetting here would show the write we just made undoing itself.
      const fresh = values.result.connections.find(
        (connection) => connection.installationId === installationId
      );

      if (!fresh || fresh.status === status) {
        actions.setOptimisticStatus(installationId, null);
      }
    };

    /*
      Intent only. Whether the write landed is the server's to report - it fires
      backend_org_subscribed and backend_org_subscribe_failed with the reason - and repeating
      that guess here would be a worse copy of it, lost to every ad blocker. A click with no
      backend event behind it is already the signal that something was dropped on the way.
    */
    return {
      subscribe: async ({ installationId }) => {
        captureEvent("org_subscribe_clicked", { installation_id: installationId });

        await toggle(
          installationId,
          "subscribed",
          (jwtToken) => ConnectionsApi.subscribe(jwtToken, installationId),
          "Could not turn this on"
        );
      },
      unsubscribe: async ({ installationId }) => {
        captureEvent("org_unsubscribe_clicked", { installation_id: installationId });

        await toggle(
          installationId,
          "available",
          (jwtToken) => ConnectionsApi.unsubscribe(jwtToken, installationId),
          "Could not turn this off"
        );
      },
      /**
       * Not optimistic, on purpose: this one is org-wide, irreversible, and the failure it
       * hits in practice - not an owner - is one the row would have to come back from.
       */
      uninstall: async ({ installationId }) => {
        const jwtToken = authLogic.values.jwtToken;

        if (!jwtToken) {
          return;
        }

        // Fires after the confirmation dialog, not before it, because this action is only
        // dispatched once somebody has confirmed. That is the intent worth counting - backing
        // out of the dialog is not an attempt to remove anything.
        captureEvent("org_uninstall_clicked", { installation_id: installationId });

        actions.setPending(installationId, true);

        try {
          await ConnectionsApi.uninstall(jwtToken, installationId);
          // Awaited, so the row keeps its spinner until it actually goes rather than looking
          // finished while the list it is about to leave is still on its way.
          await asyncActions.loadConnections();
        } catch (error: any) {
          actions.setActionError(
            error?.response?.data?.message ?? "Could not remove the app"
          );
        } finally {
          actions.setPending(installationId, false);
        }
      },
    };
  }),
]);
