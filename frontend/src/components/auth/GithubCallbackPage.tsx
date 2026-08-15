import { authLogic } from "@/lib/logics/authLogic";
import { useNavigate } from "@tanstack/react-router";
import { useActions, useValues } from "kea";
import { useEffect } from "react";

export function GithubCallbackPage() {
  const { exchangeGithubCodeForJwt, setLoginError } = useActions(authLogic);
  const { isLoggedIn, loginError } = useValues(authLogic);
  const navigate = useNavigate();

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
    if (isLoggedIn) {
      navigate({ to: "/", replace: true });
    }
  }, [isLoggedIn, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      {loginError ? (
        <div className="text-center space-y-2">
          <p className="text-destructive">{loginError}</p>
          <button
            type="button"
            onClick={() => navigate({ to: "/", replace: true })}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Back home
          </button>
        </div>
      ) : (
        <p className="text-lg text-muted-foreground">Signing you in…</p>
      )}
    </div>
  );
}
