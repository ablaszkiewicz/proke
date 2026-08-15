import { authLogic } from "@/lib/logics/authLogic";
import { connectionsLogic } from "@/lib/logics/connectionsLogic";
import { useActions, useValues } from "kea";
import { useEffect } from "react";
import { DashboardPage } from "./DashboardPage";

/** The dashboard on real data. Everything visual lives in DashboardPage. */
export function Dashboard() {
  const { userData, userDataLoading } = useValues(authLogic);
  const { logout } = useActions(authLogic);
  const { connections, installUrl, resultLoading, pendingIds, actionError } =
    useValues(connectionsLogic);
  const { loadConnections, subscribe, unsubscribe, uninstall } =
    useActions(connectionsLogic);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  return (
    <DashboardPage
      className="min-h-dvh"
      user={{
        login: userData?.githubLogin,
        avatarUrl: userData?.avatarUrl,
        // Loaded once we have a profile, or once we have stopped trying - a failed fetch must
        // still show Log out.
        loaded: userData !== null || !userDataLoading,
      }}
      onLogout={logout}
      connections={connections}
      installUrl={installUrl}
      loading={resultLoading}
      pendingIds={pendingIds}
      actionError={actionError}
      onSubscribe={subscribe}
      onUnsubscribe={unsubscribe}
      onUninstall={uninstall}
    />
  );
}
