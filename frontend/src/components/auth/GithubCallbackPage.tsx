import {
  CallbackScreen,
  useCallbackTimeline,
} from "@/components/ui/CallbackScreen";
import { authLogic } from "@/lib/logics/authLogic";
import { useNavigate } from "@tanstack/react-router";
import { useActions, useValues } from "kea";
import { useEffect } from "react";

export function GithubCallbackPage() {
  const { exchangeGithubCodeForJwt, setLoginError } = useActions(authLogic);
  const { isLoggedIn, loginError } = useValues(authLogic);
  const navigate = useNavigate();

  const { leaving, ready } = useCallbackTimeline(isLoggedIn);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      exchangeGithubCodeForJwt(code);
    } else {
      setLoginError(params.get("error_description") ?? "No GitHub code in URL");
    }
  }, [exchangeGithubCodeForJwt, setLoginError]);

  useEffect(() => {
    if (ready) {
      // Into the app, not back to the landing page - a session is the whole point of the trip.
      navigate({ to: "/app", replace: true });
    }
  }, [ready, navigate]);

  // A failure is not something to sit on for two seconds - it is the answer, and it needs
  // reading. The timeline above only paces the happy path.
  if (loginError) {
    return (
      <div className="flex min-h-dvh animate-fade-in flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-3xl font-semibold tracking-tight">proke</h1>
        <p className="text-sm text-destructive">{loginError}</p>
        <button
          type="button"
          onClick={() => navigate({ to: "/", replace: true })}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Back home
        </button>
      </div>
    );
  }

  return <CallbackScreen message="Signing you in" leaving={leaving} />;
}
