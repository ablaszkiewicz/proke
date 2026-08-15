import { DashboardDraftsPage } from "@/components/drafts/DashboardDraftsPage";
import { createFileRoute } from "@tanstack/react-router";

/** Layout drafts on mock data. `?d=3` opens the third; the page keeps it in sync. */
export const Route = createFileRoute("/drafts")({
  validateSearch: (search: Record<string, unknown>): { d: number } => ({
    d: Number(search.d) || 1,
  }),
  component: DashboardDraftsPage,
});
