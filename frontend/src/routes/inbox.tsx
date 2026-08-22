import { InboxGallery } from "@/components/inbox/InboxGallery";
import { createFileRoute } from "@tanstack/react-router";

/**
 * The review inbox, on mock data. Public like `/drafts`: it is a layout to argue about, and
 * putting it behind a session would mean nobody can open it without one.
 *
 * `?v=3` opens the third variant; the gallery keeps the URL in sync, so a particular one can be
 * linked to rather than described.
 */
export const Route = createFileRoute("/inbox")({
  validateSearch: (search: Record<string, unknown>): { v: number } => ({
    v: Number(search.v) || 1,
  }),
  component: InboxGallery,
});
