import { GithubCallbackPage } from "@/components/auth/GithubCallbackPage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/callbacks/oauth/github")({
  component: GithubTanstackPage,
});

function GithubTanstackPage() {
  return <GithubCallbackPage />;
}
