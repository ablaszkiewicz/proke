import { Button } from "@/components/ui/button";
import {
  CallbackScreen,
  useCallbackTimeline,
} from "@/components/ui/CallbackScreen";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * Where GitHub drops the user after they install, update, or request the app. Configured as
 * the app's Setup URL.
 *
 * Installs and updates bounce home - the connections panel reloads on mount, so there is
 * nothing to fetch here. A *request* is different: it is the only moment GitHub tells us an
 * approval is pending, and no API can report it afterwards, so that one stops and explains
 * itself instead of pacing through a screen and leaving.
 */
export function GithubAppSetupPage() {
  const navigate = useNavigate();

  // Read on the first render rather than in an effect. An effect runs after paint, so a request
  // that should never have shown a loading screen flashed one frame of "Adding your
  // organisation" before correcting itself.
  const [setupAction] = useState(() =>
    new URLSearchParams(window.location.search).get("setup_action")
  );

  const isRequest = setupAction === "request";
  const { leaving, ready } = useCallbackTimeline(!isRequest);

  useEffect(() => {
    if (ready) {
      // replace, so Back does not drop them onto a spent callback URL.
      navigate({ to: "/app", replace: true });
    }
  }, [ready, navigate]);

  if (isRequest) {
    return (
      <div className="flex min-h-dvh animate-fade-in flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-3xl font-semibold tracking-tight">proke</h1>
        <div className="max-w-sm space-y-3 text-center">
          <p className="text-sm font-medium">Access requested</p>
          <p className="text-sm text-muted-foreground">
            An owner of that organisation has to approve it. Until they do it
            won't appear in your list — GitHub doesn't expose pending requests to
            us, so we can't show it as waiting.
          </p>
        </div>
        <Button onClick={() => navigate({ to: "/app", replace: true })}>
          Back to proke
        </Button>
      </div>
    );
  }

  return (
    <CallbackScreen
      message={
        setupAction === "update"
          ? "Updating your organisations"
          : "Adding your organisation"
      }
      leaving={leaving}
    />
  );
}
