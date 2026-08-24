import type { InboxFilterChange, InboxFilters } from "@/lib/api/inbox.api";
import { inboxLogic } from "@/lib/logics/inboxLogic";
import { useActions, useValues } from "kea";
import { useEffect } from "react";
import { InboxPage } from "./InboxPage";

/**
 * The inbox on real data. Everything visual lives in InboxPage, which /mock-inbox drives with
 * the same props on fake timings.
 *
 * The settings arrive as props rather than being read here, because they live in the address bar
 * and the route is what owns that - see routes/app/inbox.tsx and components/inbox/search.ts.
 *
 * Nothing is fetched here either. `setFilters` is the only thing dispatched: the logic decides
 * whether that means a page opening or a switch moving, and chains the read and the refresh
 * itself, because the order the two land in is a correctness property rather than a scheduling
 * detail - see inboxLogic.
 */
export function Inbox({
  filters,
  onFilterChange,
}: {
  filters: InboxFilters;
  onFilterChange: InboxFilterChange;
}) {
  const { result, settled, refreshing, hasAnswer } = useValues(inboxLogic);
  const { setFilters } = useActions(inboxLogic);

  // Runs on the first paint and again on every navigation, which is every change of a setting -
  // the panel writes to the address bar and the answer comes back down through here. A repeat
  // of what is already set costs nothing; the logic drops it.
  useEffect(() => {
    setFilters(filters);
  }, [filters, setFilters]);

  return (
    <InboxPage
      yours={result.yours}
      waitingOnYou={result.waitingOnYou}
      refreshing={refreshing}
      stale={result.stale}
      settled={settled}
      hasAnswer={hasAnswer}
      githubReauthRequired={result.githubReauthRequired}
      filters={filters}
      teams={result.teams}
      onFilterChange={onFilterChange}
    />
  );
}
