import { LandingPage } from "@/components/landing/LandingPage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IndexTanstackPage,
});

function IndexTanstackPage() {
  return <LandingPage />;
}
