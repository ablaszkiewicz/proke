import { Inbox } from "@/components/inbox/Inbox";
import { authLogic } from "@/lib/logics/authLogic";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useValues } from "kea";

/**
 * The review inbox. Behind a session like everything else under `/app`.
 *
 * Nothing on the query string. The settings live on the account and arrive with the profile -
 * see inboxSettingsLogic - so this route is only the door: the page as it comes is `/app/inbox`
 * for everybody, and what it shows is what they last set.
 */
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
