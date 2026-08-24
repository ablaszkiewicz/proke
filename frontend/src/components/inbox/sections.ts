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
  "recent-drafts": "Recent drafts",
  drafts: "Drafts",
  team: "Your team",
  others: "Everyone else",
  bots: "Bots",
};

/**
 * Closed on arrival. A draft is a note to yourself rather than a queue.
 *
 * "Recent drafts" is not in here, and that is the whole reason it is a separate section: a draft
 * you touched inside the window is what you are in the middle of, so it is worth the space every
 * other draft is not. The server decides which of the two a row is in - it is the one holding
 * the timestamp, and the one that knows how far back the reader has asked "recent" to reach -
 * and the difference here is only whether the heading arrives open.
 *
 * A reader who turns the split off gets every draft in the pile below, and no recent heading at
 * all: an empty section is not drawn, so nothing here has to know the setting exists.
 */
export const CLOSED_BY_DEFAULT: InboxSectionKey[] = ["drafts"];
