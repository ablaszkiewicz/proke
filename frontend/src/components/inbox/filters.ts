import { INBOX_FILTER_KEYS, type InboxFilterKey } from "@/lib/api/inbox.api";

/**
 * The words on each toggle in the settings.
 *
 * The only thing about filters the client owns, for the same reason it owns only the words over
 * a section: the rule behind this one needs GitHub's review decision, which a browser cannot
 * see. What a filter does, and what happens to the rows it removes, is the server's.
 *
 * `label` is what the toggle is called and `detail` is what it does - two lines rather than one
 * long one, because a filter that has to be read twice is a filter nobody touches.
 */
export interface InboxFilterOption {
  key: InboxFilterKey;
  label: string;
  detail: string;
}

export const INBOX_FILTER_OPTIONS: InboxFilterOption[] = [
  {
    key: "includeApproved",
    label: "Approved pull requests",
    // Says whose, deliberately, and in two sentences rather than one careful clause. Your own
    // approved pull requests keep their section whatever this is set to - they are the ones with
    // a button left to press - and somebody who read this as "hide everything approved" would go
    // looking for the thing they were about to merge.
    detail:
      "Ones waiting on you that somebody has already approved. Your own always show.",
  },
];

/**
 * Guards the one thing the type system cannot: that every filter the API knows about has words
 * to go with it. A filter with no entry here would simply never be drawn, which is a feature
 * silently missing rather than a build that fails.
 */
if (import.meta.env.DEV) {
  const drawn = new Set(INBOX_FILTER_OPTIONS.map((option) => option.key));
  const missing = INBOX_FILTER_KEYS.filter((key) => !drawn.has(key));

  if (missing.length > 0) {
    console.warn(
      `Inbox filters with no entry in INBOX_FILTER_OPTIONS, so nothing draws them: ${missing.join(", ")}`
    );
  }
}
