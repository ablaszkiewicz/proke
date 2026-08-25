import { Toast } from "@/components/ui/Toast";
import type { InboxFilterChange } from "@/lib/api/inbox.api";
import { inboxLogic } from "@/lib/logics/inboxLogic";
import { inboxSettingsLogic } from "@/lib/logics/inboxSettingsLogic";
import { useActions, useValues } from "kea";
import { useEffect } from "react";
import { InboxPage } from "./InboxPage";

/**
 * The inbox on real data. Everything visual lives in InboxPage, which /mock-inbox drives with
 * the same props on fake timings.
 *
 * The settings come from inboxSettingsLogic, which holds what the account says and what has
 * been pressed since. Nothing is fetched here. `setFilters` is the only thing dispatched: the
 * logic decides whether that means a page opening or a switch moving, and chains the read and
 * the refresh itself, because the order the two land in is a correctness property rather than a
 * scheduling detail - see inboxLogic.
 */
export function Inbox() {
  const { result, settled, refreshing, hasAnswer } = useValues(inboxLogic);
  const { setFilters } = useActions(inboxLogic);
  const { filters, loaded, notice } = useValues(inboxSettingsLogic);
  const { setFilter, dismissNotice } = useActions(inboxSettingsLogic);

  // Runs once the account has been read, and again on every change of a setting - the panel
  // moves a switch and the answer comes back down through here. Not before: a read made under
  // the defaults would be replaced a moment later by one under the real settings, and if a
  // build filter differed the first would have been a trip to GitHub for nothing. A repeat of
  // what is already set costs nothing; the logic drops it.
  useEffect(() => {
    if (loaded) {
      setFilters(filters);
    }
  }, [loaded, filters, setFilters]);

  // One setting at a time, typed against its key - see InboxFilterChange. The logic's own
  // action is the untyped pair, because kea's generated types cannot carry a generic.
  const onFilterChange: InboxFilterChange = (key, value) => setFilter(key, value);

  return (
    <>
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

      {/*
        Here rather than in InboxPage, because it is about a save and that page knows nothing of
        saving - /mock-inbox drives it with settings that live in a `useState`. A portal, so it
        is not clipped by the drawer it was probably dismissed from - see Toast.
      */}
      {notice ? (
        <Toast message={notice} onDismiss={dismissNotice} resetKey={notice} />
      ) : null}
    </>
  );
}
