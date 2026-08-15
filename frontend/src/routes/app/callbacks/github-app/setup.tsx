import { GithubAppSetupPage } from "@/components/connections/GithubAppSetupPage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/callbacks/github-app/setup")({
  component: GithubAppSetupTanstackPage,
});

function GithubAppSetupTanstackPage() {
  return <GithubAppSetupPage />;
}
