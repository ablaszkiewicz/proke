import {
  INBOX_FILTER_KEYS,
  RECENT_DRAFT_WINDOWS,
  type InboxFilterKey,
  type InboxFilters,
  type RecentDraftWindow,
} from "@/lib/api/inbox.api";

/**
 * The words on each toggle in the settings.
 *
 * The only thing about filters the client owns, for the same reason it owns only the words over
 * a section: the rules behind them need things a browser cannot see - GitHub's review decision,
 * its idea of when a pull request last moved, its idea of who is on your team. What a filter
 * does, and what happens to the rows it removes, is the server's.
 *
 * `label` is what the toggle is called and `detail` is what it does - two lines rather than one
 * long one, because a filter that has to be read twice is a filter nobody touches.
 *
 * ## The shapes a filter comes in
 *
 * `switch` is on or off and nothing else. `window` is on or off and, when on, says how far back
 * it reaches. `teams` is on or off and, when on, lists the teams it is built from so one can be
 * struck out. `authors` is a list of logins with no switch over it, because an empty list is
 * already off.
 *
 * One list rather than four, because the panel draws them in order and a second list would be a
 * second place to forget one; the `kind` is what tells the panel which control to draw. Every
 * one of them is words plus the shape of the control, and never a rule - the rules are all on
 * the server, because each of them needs something a browser cannot see.
 */

interface FilterOptionBase {
  label: string;
  detail: string;
}

/** A filter that is on or off. */
export interface SwitchOption extends FilterOptionBase {
  kind: "switch";
  key: "includeApproved" | "separateBots";
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

/** A filter that is on or off and, when on, carries how far back it reaches. */
export interface WindowOption extends FilterOptionBase {
  kind: "window";
  key: "recentDrafts";
  /** Names the row of spans for anyone who cannot see that it sits under the toggle. */
  choicesLabel: string;
  choices: readonly RecentDraftWindow[];
}

/**
 * The "your team" heading: a switch, and under it the teams the heading is built from.
 *
 * Two filters behind one control, which is the only place in here that happens and is worth the
 * exception. `separateTeam` is whether the heading exists and `excludedTeams` is what counts as
 * your team, and the second is meaningless without the first - so they are drawn as one thing
 * and the panel hides the list when the switch is off, exactly as it hides the spans.
 */
export interface TeamsOption extends FilterOptionBase {
  kind: "teams";
  key: "separateTeam";
  /** The list the switch governs. Named rather than assumed, so the pairing is readable. */
  membersKey: "excludedTeams";
  /**
   * The three things this can say instead of a list, which are three and not two.
   *
   * `waiting` is before GitHub has answered at all. `unavailable` is after it has answered the
   * rest of the inbox and still not said, which is either proke missing the "Members"
   * organisation permission or GitHub rate-limiting the burst of member lookups - it answers
   * both with a 403, so nothing downstream can tell them apart and the words must not pretend
   * to. `none` is GitHub saying you are in no teams.
   *
   * Told apart because "still loading" and "this will never load" draw as the same nothing and
   * mean opposite things to whoever is waiting on it.
   */
  waiting: string;
  unavailable: string;
  none: string;
}

/**
 * A list of logins, typed in.
 *
 * No switch: an empty list is off, and a toggle over it would be a second way to say the same
 * thing and a state where the list is set but not in force.
 */
export interface AuthorsOption extends FilterOptionBase {
  kind: "authors";
  key: "ignoredAuthors";
  placeholder: string;
}

export type InboxFilterOption =
  | SwitchOption
  | WindowOption
  | TeamsOption
  | AuthorsOption;

export const INBOX_FILTER_OPTIONS: InboxFilterOption[] = [
  {
    kind: "switch",
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
  {
    kind: "window",
    key: "recentDrafts",
    label: "Recent drafts",
    // Says what turning it off does, because that is the part nobody would guess: the drafts do
    // not disappear, they go back in with the rest. The heading is what is being turned off,
    // not the work.
    detail:
      "The draft you are in the middle of, kept out of the pile. Off puts every draft together.",
    choicesLabel: "How recently a draft moved",
    choices: RECENT_DRAFT_WINDOWS,
  },
  {
    kind: "teams",
    key: "separateTeam",
    membersKey: "excludedTeams",
    label: "Your team",
    // Same sentence shape as the others, and for the same reason: the thing nobody would guess
    // is that off is a merge rather than a removal.
    detail:
      "Their pull requests, above everyone else's. Off puts them in with everyone else.",
    waiting: "Asking GitHub which teams you are in…",
    // Both causes, because they are not distinguishable from here and only one of them is
    // anybody's fault: GitHub answers a missing organisation permission and a rate-limited burst
    // with the same 403. Ends with the thing to do, since neither cause is worth explaining to
    // somebody who just wants the list.
    unavailable:
      "GitHub would not say which teams you are in — a missing Members permission, or it was " +
      "busy. Reload to ask again.",
    none: "GitHub says you are in no teams, so nothing lands here.",
  },
  {
    kind: "switch",
    key: "separateBots",
    label: "Bots section",
    // One clause. The label already says which section, and what off does - back in with
    // everyone else - is the same answer as for the section above it, which has now said it.
    detail: "Machines get their own section.",
  },
  {
    kind: "authors",
    key: "ignoredAuthors",
    label: "Ignore authors",
    // "Never reach you" rather than "hidden", because this one really does remove the row - it
    // is the only setting in the drawer that does, and that difference is the whole reason it is
    // worded apart from the ones above it.
    detail: "Their pull requests never reach you.",
    placeholder: "Add a login…",
  },
];

/**
 * Where the switch sits, which is not always what the filter says.
 *
 * A function rather than a boolean worked out at the call site, because getting this backwards
 * is invisible: the panel still draws, the switch still moves, and the only symptom is a filter
 * that does the opposite of its own label.
 *
 * For a window, "on" is simply anything that is not `off` - the span it is set to is the row of
 * buttons' business, not the switch's.
 */
export function switchPosition(
  option: SwitchOption | WindowOption | TeamsOption,
  filters: InboxFilters
): boolean {
  if (option.kind === "window") {
    return filters[option.key] !== "off";
  }

  if (option.kind === "teams") {
    return filters[option.key];
  }

  return option.inverted ? !filters[option.key] : filters[option.key];
}

/**
 * The filter value to send when a switch currently sitting at `on` is pressed.
 *
 * Pressing moves the switch to `!on`, and an inverted option's filter value is the negation of
 * its switch - so the two negations cancel and the answer is `on` itself. Written out rather
 * than inlined precisely because it reads like a mistake.
 */
export function valueWhenPressed(option: SwitchOption, on: boolean): boolean {
  return option.inverted ? on : !on;
}

/**
 * Guards the one thing the type system cannot: that every filter the API knows about has words
 * to go with it. A filter with no entry here would simply never be drawn, which is a feature
 * silently missing rather than a build that fails.
 */
if (import.meta.env.DEV) {
  const drawn = new Set<InboxFilterKey>();

  for (const option of INBOX_FILTER_OPTIONS) {
    drawn.add(option.key);

    // The one control that governs two filters. Counted as drawing both, or the guard would
    // report `excludedTeams` missing forever and stop being read.
    if (option.kind === "teams") {
      drawn.add(option.membersKey);
    }
  }

  const missing = INBOX_FILTER_KEYS.filter((key) => !drawn.has(key));

  if (missing.length > 0) {
    console.warn(
      `Inbox filters with no entry in INBOX_FILTER_OPTIONS, so nothing draws them: ${missing.join(", ")}`
    );
  }
}
