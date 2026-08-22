import {
  CallbackScreen,
  useCallbackTimeline,
} from "@/components/ui/CallbackScreen";
import { inboxLogic } from "@/lib/logics/inboxLogic";
import { useActions, useValues } from "kea";
import { useEffect } from "react";
import { InboxPage } from "./InboxPage";

/**
 * The inbox on real data. Everything visual lives in InboxPage.
 *
 * Only `loadInbox` is dispatched here. The refresh is chained off it inside the logic, because
 * the order the two land in is a correctness property rather than a scheduling detail - see
 * inboxLogic.
 *
 * Nothing of the page is shown until there is something real to show. Rendering the headings
 * against an empty result first is what produced the flicker: seven sections, each briefly
 * saying there was nothing in it, and then the rows arriving underneath.
 */
export function Inbox() {
  const { result, settled, refreshing, hasAnswer } = useValues(inboxLogic);
  const { loadInbox } = useActions(inboxLogic);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const { leaving, ready } = useCallbackTimeline(settled);

  if (!ready) {
    return (
      // Inside the inbox's own palette, and painting its own background. The screen would
      // otherwise render on the app's default black and hand over to a warm near-black page,
      // which is a second flash in place of the one this exists to remove.
      <CallbackScreen
        message="Reading your pull requests"
        leaving={leaving}
        className="theme-ink bg-background text-foreground"
      />
    );
  }

  return (
    <InboxPage
      yours={result.yours}
      waitingOnYou={result.waitingOnYou}
      refreshing={refreshing}
      stale={result.stale}
      hasAnswer={hasAnswer}
      githubReauthRequired={result.githubReauthRequired}
    />
  );
}
