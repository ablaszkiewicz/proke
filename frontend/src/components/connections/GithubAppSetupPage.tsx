import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * Where GitHub drops the user after they install, update, or request the app. Configured as
 * the app's Setup URL.
 *
 * Installs and updates bounce straight home - the connections panel reloads on mount, so
 * there is nothing to fetch here and nothing worth reading. A *request* is different: it is
 * the only moment GitHub tells us an approval is pending, and no API can report it
 * afterwards, so that one stops and explains itself.
 */
export function GithubAppSetupPage() {
  const navigate = useNavigate();
  const [setupAction, setSetupAction] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSetupAction(params.get("setup_action"));
    setChecked(true);
  }, []);

  useEffect(() => {
    if (!checked || setupAction === "request") {
      return;
    }

    // replace, so Back does not drop them onto a spent callback URL.
    navigate({ to: "/", replace: true });
  }, [checked, setupAction, navigate]);

  if (setupAction !== "request") {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Finishing up…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-lg font-medium">Access requested</h1>
        <p className="text-sm text-muted-foreground">
          An owner of that organisation has to approve it. Until they do it won't
          appear in your list — GitHub doesn't expose pending requests to us, so
          we can't show it as waiting.
        </p>

        <Button onClick={() => navigate({ to: "/", replace: true })}>
          Back to proke
        </Button>
      </div>
    </div>
  );
}
