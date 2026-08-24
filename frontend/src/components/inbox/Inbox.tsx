import { inboxLogic } from "@/lib/logics/inboxLogic";
import { useActions, useValues } from "kea";
import { useEffect } from "react";
import { InboxPage } from "./InboxPage";

/**
 * The inbox on real data. Everything visual lives in InboxPage, which /mock-inbox drives with
 * the same props on fake timings.
 *
 * Only `loadInbox` is dispatched here. The refresh is chained off it inside the logic, because
 * the order the two land in is a correctness property rather than a scheduling detail - see
 * inboxLogic.
 */
export function Inbox() {
  const { result, settled, refreshing, hasAnswer, filters } =
    useValues(inboxLogic);
  const { loadInbox, setFilter } = useActions(inboxLogic);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

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
      // Nothing is fetched here either: the logic chains the refresh off the change, for the
      // same reason it chains it off the read.
      onFilterChange={setFilter}
    />
  );
}
