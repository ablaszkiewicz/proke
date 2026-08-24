import { MockInboxPage } from "@/components/mock-inbox/MockInboxPage";
import { createFileRoute } from "@tanstack/react-router";

/**
 * The inbox on invented rows, for trying settings out.
 *
 * No session, no server, no network: the rows are a fixture and the rules run in the browser -
 * see components/mock-inbox/mockInbox.ts, which also says at length why none of that is allowed
 * to leak back into the real page.
 *
 * Deliberately not under `/app`. Everything there is behind a session because everything there
 * is somebody's data, and this is nobody's.
 */
export const Route = createFileRoute("/mock-testing-inbox")({
  component: MockInboxPage,
});
