import { actions, kea, listeners, path, reducers, selectors } from "kea";
import { loaders } from "kea-loaders";

import {
  ConnectionsApi,
  type Connection,
  type ConnectionsResult,
} from "../api/connections.api";
import { authLogic } from "./authLogic";

import type { connectionsLogicType } from "./connectionsLogicType";

const EMPTY: ConnectionsResult = { connections: [], installUrl: "" };

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
    // Per-row, so one slow request does not put every button in a loading state.
    pendingIds: [
      [] as string[],
      {
        setPending: (state, { installationId, pending }) =>
          pending
            ? [...state, installationId]
            : state.filter((id) => id !== installationId),
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
      (s) => [s.result],
      (result: ConnectionsResult): Connection[] => result.connections,
    ],
    installUrl: [
      (s) => [s.result],
      (result: ConnectionsResult): string => result.installUrl,
    ],
  }),

  listeners(({ actions }) => ({
    subscribe: async ({ installationId }) => {
      const jwtToken = authLogic.values.jwtToken;

      if (!jwtToken) {
        return;
      }

      actions.setPending(installationId, true);

      try {
        await ConnectionsApi.subscribe(jwtToken, installationId);
        actions.loadConnections();
      } finally {
        actions.setPending(installationId, false);
      }
    },
    uninstall: async ({ installationId }) => {
      const jwtToken = authLogic.values.jwtToken;

      if (!jwtToken) {
        return;
      }

      actions.setPending(installationId, true);

      try {
        await ConnectionsApi.uninstall(jwtToken, installationId);
        actions.loadConnections();
      } catch (error: any) {
        actions.setActionError(
          error?.response?.data?.message ?? "Could not remove the app"
        );
      } finally {
        actions.setPending(installationId, false);
      }
    },
    unsubscribe: async ({ installationId }) => {
      const jwtToken = authLogic.values.jwtToken;

      if (!jwtToken) {
        return;
      }

      actions.setPending(installationId, true);

      try {
        await ConnectionsApi.unsubscribe(jwtToken, installationId);
        actions.loadConnections();
      } finally {
        actions.setPending(installationId, false);
      }
    },
  })),
]);
