import type { InboxSectionKey } from "@/lib/api/inbox.api";

/**
 * The words over each pile of pull requests.
 *
 * The only thing about sections the client owns. Which pile a row is in, which sections exist
 * and what order they come in are all decided by the server, because each of those needs
 * something a browser cannot see - a review thread's state, a team's membership, whether an
 * author is a machine.
 */
export const SECTION_TITLES: Record<InboxSectionKey, string> = {
  approved: "Approved",
  "unresolved-comments": "Unresolved comments",
  "waiting-for-reviewers": "Waiting for reviewers",
  drafts: "Drafts",
  team: "Your team",
  others: "Everyone else",
  bots: "Bots",
};

/** Closed on arrival. A draft is a note to yourself rather than a queue. */
export const CLOSED_BY_DEFAULT: InboxSectionKey[] = ["drafts"];
