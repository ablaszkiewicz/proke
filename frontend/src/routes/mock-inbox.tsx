import { MockInbox } from "@/components/inbox/mock/MockInbox";
import { createFileRoute } from "@tanstack/react-router";

/**
 * The inbox transition on fake timings, with a replay button. Public and unauthenticated: it
 * talks to nothing, and the whole point is being able to open it and hit replay twenty times.
 */
export const Route = createFileRoute("/mock-inbox")({
  component: MockInbox,
});
