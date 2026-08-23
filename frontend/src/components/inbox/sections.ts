import type { InboxSectionKey } from "@/lib/api/inbox.api";

/**
 * The shape of a pile: which sections it has, in what order, and what each is called.
 *
 * The client owns this now. It used to take the list from whatever the server sent, which meant
 * a page with no answer yet had no headings either - and the headings are the layout. They are
 * on screen from the first frame, empty, and the rows cascade into them; there is nothing to
 * render that against if the list only exists once the data does.
 *
 * What the server still owns is the part a browser cannot work out: which pile a given pull
 * request lands in, and in what order within it. That needs a review thread's state, a team's
 * membership, whether an author is a machine. These two lists must stay in step with
 * YOURS_SECTIONS and WAITING_SECTIONS in the backend's inbox.interface.ts - a key the server
 * sends that is missing here is a section of rows that silently never render.
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

/** Your own pull requests, top to bottom. */
export const YOURS_SECTIONS: InboxSectionKey[] = [
  "approved",
  "unresolved-comments",
  "waiting-for-reviewers",
  "drafts",
];

/** Other people's, waiting on you. */
export const WAITING_SECTIONS: InboxSectionKey[] = ["team", "others", "bots"];

/** Closed on arrival. A draft is a note to yourself rather than a queue. */
export const CLOSED_BY_DEFAULT: InboxSectionKey[] = ["drafts"];
