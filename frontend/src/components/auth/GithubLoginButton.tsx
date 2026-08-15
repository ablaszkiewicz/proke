import { Button } from "@/components/ui/button";
import { GitHubIcon } from "@/components/ui/GitHubIcon";
import { useState } from "react";

export function GithubLoginButton() {
  const [redirecting, setRedirecting] = useState(false);

  const clientId = import.meta.env.VITE_GITHUB_APP_CLIENT_ID;
  const appUrl = import.meta.env.VITE_APP_URL;

  const handleGithubLogin = () => {
    setRedirecting(true);

    const redirectUri = `${appUrl}/app/callbacks/oauth/github`;
    // No `scope` here: this is a GitHub App, and GitHub ignores the parameter. What the
    // resulting token can do is fixed by the app's configured permissions instead.
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}`;
  };

  if (!clientId) {
    return (
      <p className="text-center text-xs text-destructive">
        VITE_GITHUB_APP_CLIENT_ID is not set. Copy{" "}
        <code>frontend/.env.example</code> to <code>frontend/.env</code> and
        fill it in.
      </p>
    );
  }

  return (
    <Button
      onClick={handleGithubLogin}
      variant="outline"
      size="lg"
      isLoading={redirecting}
      className="w-full flex items-center justify-center gap-3 h-10 cursor-pointer rounded-md"
    >
      <GitHubIcon />
      <span>Sign in with GitHub</span>
    </Button>
  );
}
