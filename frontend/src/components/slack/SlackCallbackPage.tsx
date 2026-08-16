import { Button } from "@/components/ui/button";
import {
  CallbackScreen,
  useCallbackTimeline,
} from "@/components/ui/CallbackScreen";
import { slackLogic } from "@/lib/logics/slackLogic";
import { useNavigate } from "@tanstack/react-router";
import { useActions, useValues } from "kea";
import { useEffect } from "react";

/**
 * Where Slack drops the user after they authorize. Both flows land here - signing in and
 * adding the app - because Slack allows one redirect URL, and the backend can tell which
 * happened from the response itself.
 *
 * A success bounces home once the screen has had its moment. A failure stops, because the
 * reason is usually something the user has to act on.
 */
export function SlackCallbackPage() {
  const { connect, setActionError } = useActions(slackLogic);
  const { connectState, actionError } = useValues(slackLogic);
  const navigate = useNavigate();

  const { leaving, ready } = useCallbackTimeline(connectState === "done");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (code && state) {
      connect({ code, state });
      return;
    }

    // Slack sends `error=access_denied` when somebody backs out, and nothing else at all when
    // an admin has to approve the install first.
    setActionError(
      params.get("error") === "access_denied"
        ? "That authorization was cancelled."
        : (params.get("error") ?? "Slack did not send a code back.")
    );
  }, [connect, setActionError]);

  useEffect(() => {
    if (ready) {
      // replace, so Back does not drop them onto a spent callback URL.
      navigate({ to: "/app", replace: true });
    }
  }, [ready, navigate]);

  if (actionError) {
    return (
      <div className="flex min-h-dvh animate-fade-in flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-3xl font-semibold tracking-tight">proke</h1>
        <div className="max-w-sm space-y-3 text-center">
          <p className="text-sm font-medium">Slack didn't connect</p>
          <p className="text-sm text-muted-foreground">{actionError}</p>
        </div>
        <Button onClick={() => navigate({ to: "/app", replace: true })}>
          Back to proke
        </Button>
      </div>
    );
  }

  return <CallbackScreen message="Connecting Slack" leaving={leaving} />;
}
