import {
  INBOX_FILTER_KEYS,
  type InboxFilterKey,
  type InboxFilters,
} from "@/lib/api/inbox.api";

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
  /**
   * Whether the switch reads the opposite way round from the filter behind it.
   *
   * The two are allowed to disagree, and this is the only place they are reconciled. Every name
   * that crosses the wire says what it *includes* - `includeApproved`, never `hideApproved` -
   * because that is the only way the server's rules and the cache key that files a snapshot can
   * be read aloud without a double negative. What somebody wants to press is sometimes the other
   * sentence: "hide approved PRs", on by default, is a thing you turn on to make the pile
   * shorter, where "approved pull requests", off by default, is a thing you have to notice is
   * off before you can understand what you are looking at.
   *
   * So the words invert here and nothing else does. Nobody downstream - not the logic, not the
   * request, not the server - ever sees the flipped value.
   */
  inverted?: boolean;
}

export const INBOX_FILTER_OPTIONS: InboxFilterOption[] = [
  {
    key: "includeApproved",
    label: "Hide approved PRs",
    inverted: true,
    // Says whose, deliberately, and in two sentences rather than one careful clause. Your own
    // approved pull requests keep their section whatever this is set to - they are the ones with
    // a button left to press - and somebody who read the label as "hide everything approved"
    // would go looking for the thing they were about to merge.
    detail:
      "Ones waiting on you that somebody has already approved. Your own always show.",
  },
];

/**
 * Where the switch sits, which is not always what the filter says - see `inverted`.
 *
 * A function rather than a boolean worked out at the call site, because getting this backwards
 * is invisible: the panel still draws, the switch still moves, and the only symptom is a filter
 * that does the opposite of its own label.
 */
export function switchPosition(
  option: InboxFilterOption,
  filters: InboxFilters
): boolean {
  return option.inverted ? !filters[option.key] : filters[option.key];
}

/**
 * The filter value to send when a switch currently sitting at `on` is pressed.
 *
 * Pressing moves the switch to `!on`, and an inverted option's filter value is the negation of
 * its switch - so the two negations cancel and the answer is `on` itself. Written out rather
 * than inlined precisely because it reads like a mistake.
 */
export function valueWhenPressed(
  option: InboxFilterOption,
  on: boolean
): boolean {
  return option.inverted ? on : !on;
}

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
