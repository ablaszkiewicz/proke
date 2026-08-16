import { Dashboard } from "@/components/dashboard/Dashboard";
import { authLogic } from "@/lib/logics/authLogic";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useValues } from "kea";

/** The signed-in app. Everything under `/app` is behind a session; `/` is the public page. */
export const Route = createFileRoute("/app/")({
  component: AppTanstackPage,
});

function AppTanstackPage() {
  // The token is read from local storage as the logic mounts, so this is decided on the first
  // render rather than after a flash of the dashboard. Anyone without one belongs on the
  // landing page, which is where the way back in is.
  const { isLoggedIn } = useValues(authLogic);

  if (!isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return <Dashboard />;
}
