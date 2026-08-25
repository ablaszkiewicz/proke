import type {
  InboxBuildFilters,
  InboxFilterChange,
  InboxFilters,
} from "@/lib/api/inbox.api";
import { inboxLogic } from "@/lib/logics/inboxLogic";
import { inboxWarmLogic } from "@/lib/logics/inboxWarmLogic";
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
  onShowBuildFilters,
}: {
  filters: InboxFilters;
  onFilterChange: InboxFilterChange;
  /**
   * Show a kept view: both build filters at once, keeping whatever team and author settings are
   * in force. Separate from `onFilterChange`, which sets one filter and would cost two
   * navigations - and briefly show a set of settings nobody chose in between.
   */
  onShowBuildFilters: (filters: InboxBuildFilters) => void;
}) {
  const { result, settled, refreshing, hasAnswer } = useValues(inboxLogic);
  const { setFilters } = useActions(inboxLogic);
  const { pins, max, loaded, undo, notice } = useValues(inboxWarmLogic);
  const { keepWarm, dropWarm, undoDrop, dismissUndo, loadWarm } =
    useActions(inboxWarmLogic);

  // Runs on the first paint and again on every navigation, which is every change of a setting -
  // the panel writes to the address bar and the answer comes back down through here. A repeat
  // of what is already set costs nothing; the logic drops it.
  useEffect(() => {
    setFilters(filters);
  }, [filters, setFilters]);

  // Once, on arrival, and not again as the settings move. The list is about which views are
  // kept rather than which one is on screen, so a navigation tells it nothing new.
  useEffect(() => {
    loadWarm();
  }, [loadWarm]);

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
      warm={{
        pins,
        max,
        loaded,
        undo,
        notice,
        onKeep: keepWarm,
        onDrop: dropWarm,
        onUndo: undoDrop,
        onDismissUndo: dismissUndo,
        onShow: onShowBuildFilters,
      }}
    />
  );
}
