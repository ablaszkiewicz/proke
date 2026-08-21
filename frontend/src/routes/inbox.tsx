import { InboxPage } from "@/components/inbox/InboxPage";
import { createFileRoute } from "@tanstack/react-router";

/**
 * The review inbox, on mock data. Public like `/drafts`: it is a layout to argue about, and
 * putting it behind a session would mean nobody can open it without one.
 */
export const Route = createFileRoute("/inbox")({
  component: InboxPage,
});
