import { inboxLogic } from "@/lib/logics/inboxLogic";
import { useActions, useValues } from "kea";
import { useEffect } from "react";
import { InboxPage } from "./InboxPage";

/** The inbox on real data. Everything visual lives in InboxPage. */
export function Inbox() {
  const { result, resultLoading } = useValues(inboxLogic);
  const { loadInbox } = useActions(inboxLogic);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  // Only the first load is a loading state. A refresh that replaces rows already on screen
  // should not blank them out and put "Loading…" over the top.
  const hasAnswer = result.refreshedAt !== undefined;

  return (
    <InboxPage
      yours={result.yours}
      waitingOnYou={result.waitingOnYou}
      loading={resultLoading && !hasAnswer}
      stale={result.stale}
      githubReauthRequired={result.githubReauthRequired}
    />
  );
}
