import { Inbox } from "@/components/inbox/Inbox";
import { authLogic } from "@/lib/logics/authLogic";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useValues } from "kea";

/** The review inbox. Behind a session like everything else under `/app`. */
export const Route = createFileRoute("/app/inbox")({
  component: InboxTanstackPage,
});

function InboxTanstackPage() {
  // The token is read from local storage as the logic mounts, so this is decided on the first
  // render rather than after a flash of the page.
  const { isLoggedIn } = useValues(authLogic);

  if (!isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return <Inbox />;
}
