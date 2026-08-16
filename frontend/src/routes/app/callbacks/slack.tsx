import { SlackCallbackPage } from "@/components/slack/SlackCallbackPage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/callbacks/slack")({
  component: SlackTanstackPage,
});

function SlackTanstackPage() {
  return <SlackCallbackPage />;
}
