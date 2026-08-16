import { Button } from "@/components/ui/button";
import { slackLogic } from "@/lib/logics/slackLogic";
import { useNavigate } from "@tanstack/react-router";
import { useActions, useValues } from "kea";
import { useEffect } from "react";

/**
 * Where Slack drops the user after they authorize. Both flows land here - signing in and
 * adding the app - because Slack allows one redirect URL, and the backend can tell which
 * happened from the response itself.
 *
 * A success bounces straight home: the panel there is the answer. A failure stops, because
 * the reason is usually something the user has to act on.
 */
export function SlackCallbackPage() {
  const { connect, setActionError } = useActions(slackLogic);
  const { connectState, actionError } = useValues(slackLogic);
  const navigate = useNavigate();

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
    if (connectState === "done") {
      // replace, so Back does not drop them onto a spent callback URL.
      navigate({ to: "/", replace: true });
    }
  }, [connectState, navigate]);

  if (actionError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-sm space-y-4 text-center">
          <h1 className="text-lg font-medium">Slack didn't connect</h1>
          <p className="text-sm text-muted-foreground">{actionError}</p>
          <Button onClick={() => navigate({ to: "/", replace: true })}>
            Back to proke
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <p className="text-lg text-muted-foreground">Connecting Slack…</p>
    </div>
  );
}
