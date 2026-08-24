import { actions, kea, listeners, path, reducers, selectors } from "kea";
import { loaders } from "kea-loaders";

import {
  DEFAULT_INBOX_FILTERS,
  InboxApi,
  type InboxFilterKey,
  type InboxFilters,
  type InboxResult,
} from "../api/inbox.api";
import { authLogic } from "./authLogic";

import type { inboxLogicType } from "./inboxLogicType";

/**
 * Nothing known yet. Distinguished from a genuinely empty inbox by the absent `refreshedAt`,
 * which is the whole reason the server sends that field.
 */
const EMPTY: InboxResult = {
  stale: false,
  githubReauthRequired: false,
  yours: [],
  waitingOnYou: [],
};

/**
 * The inbox, in two passes.
 *
 * `loadInbox` reads the stored snapshot - a database lookup, back in milliseconds - and
 * `refreshInbox` goes and asks GitHub. Both write the same value, so the second simply replaces
 * the first when it lands.
 *
 * ## Why they run one after the other rather than together
 *
 * They write the same value and they take wildly different times. Fired in parallel, the read
 * can easily land *after* the refresh and overwrite fresh rows with the older snapshot it was
 * always going to return. Chaining the refresh off the read's completion makes the newest answer
 * the last one written, which is the only ordering that is correct rather than usually correct.
 *
 * Chained off failure as well as success: a read that errored is more reason to ask GitHub, not
 * less.
 *
 * ## Why changing a filter refreshes rather than re-reads
 *
 * Because a snapshot is built under one set of filters, so the stored one for the settings you
 * have just switched to is either absent or older than the one on screen. Reading it first would
 * blank the page and then fill it back in; going straight to GitHub leaves every row where it is
 * until the real answer lands, and the rows the filter removes then animate out under somebody
 * who is already looking at them - which is the one moment on this page where movement is
 * telling them something.
 *
 * The read is not skipped for correctness reasons either way: `refreshInbox` writes the same
 * value, and its breakpoint drops any older refresh still in flight.
 *
 * ## Why the rows are replaced rather than merged
 *
 * A refresh answers with the complete truth, so anything missing from it is genuinely gone -
 * merged, closed, reviewed. Rows are keyed on GitHub's node id, so React keeps every row that is
 * in both answers exactly where it is and only adds and removes the difference: on screen it
 * reads as items appearing, without anyone having to write a merge that would need a policy for
 * pull requests that disappeared.
 */
export const inboxLogic = kea<inboxLogicType>([
  path(["src", "lib", "logics", "inboxLogic"]),

  actions({
    setFilter: (key: InboxFilterKey, value: boolean) => ({ key, value }),
  }),

  loaders(({ values }) => ({
    result: [
      EMPTY,
      {
        loadInbox: async (): Promise<InboxResult> => {
          const jwtToken = authLogic.values.jwtToken;

          if (!jwtToken) {
            return EMPTY;
          }

          return InboxApi.read(jwtToken, values.filters);
        },
        // `void` payload rather than none at all: the second argument is the breakpoint, and
        // there is no way to reach it without naming the first. Typed this way the action is
        // still called with no arguments.
        refreshInbox: async (_: void, breakpoint): Promise<InboxResult> => {
          const jwtToken = authLogic.values.jwtToken;

          if (!jwtToken) {
            return EMPTY;
          }

          const result = await InboxApi.refresh(jwtToken, values.filters);
          // Drops the answer if a newer refresh started while this one was in flight, so a slow
          // one cannot land on top of a fast one that came after it.
          breakpoint();

          return result;
        },
      },
    ],
  })),

  reducers({
    /**
     * The reader's choices, kept between visits - a filter somebody sets is a statement about
     * how they work, and asking again every morning would make it not worth setting.
     *
     * Stored as whatever has been set rather than as a complete object, and completed by the
     * selector below. A stored object would be missing every filter added after it was written,
     * which is exactly the shape of a deploy: the value in somebody's browser is always the one
     * the previous version of this file wrote.
     */
    chosenFilters: [
      {} as Partial<InboxFilters>,
      { persist: true },
      {
        setFilter: (state, { key, value }) => ({ ...state, [key]: value }),
      },
    ],
    /** Whether a trip to GitHub is in flight. Not whether anything is on screen. */
    refreshing: [
      false,
      {
        refreshInbox: () => true,
        refreshInboxSuccess: () => false,
        refreshInboxFailure: () => false,
      },
    ],
    /**
     * Whether GitHub has been asked at all this session, however it went.
     *
     * Half of what decides the page may be shown. A read that came back with nothing stored is
     * not an empty inbox - it is a user whose snapshot has not been built yet - so the page has
     * to keep waiting until something has actually asked.
     */
    refreshAttempted: [
      false,
      {
        refreshInboxSuccess: () => true,
        refreshInboxFailure: () => true,
      },
    ],
  }),

  selectors({
    /**
     * What to send, and what to draw the toggles from.
     *
     * Always complete: the defaults first, then whatever has been set on top. A filter added in
     * a later deploy therefore arrives at its own default for everybody, rather than as an
     * `undefined` that would be dropped from the request and drawn as an off switch - which for
     * a filter that defaults to on is the page quietly doing the opposite of what it says.
     */
    filters: [
      (s) => [s.chosenFilters],
      (chosenFilters: Partial<InboxFilters>): InboxFilters => ({
        ...DEFAULT_INBOX_FILTERS,
        ...chosenFilters,
      }),
    ],
    /**
     * Whether there is anything worth showing, as opposed to a page of empty headings.
     *
     * True as soon as a stored snapshot arrives - that is the fast path, and the rows are real
     * even if a refresh is still running behind them. Otherwise it waits for GitHub to have been
     * asked, so a first-ever load stays on the loading screen rather than flashing "Nothing
     * open" at somebody who has eleven reviews waiting.
     */
    settled: [
      (s) => [s.result, s.refreshAttempted],
      (result: InboxResult, refreshAttempted: boolean): boolean =>
        result.refreshedAt !== undefined || refreshAttempted,
    ],
    /** Whether GitHub has ever answered for this person. Governs what an empty pile may say. */
    hasAnswer: [
      (s) => [s.result],
      (result: InboxResult): boolean => result.refreshedAt !== undefined,
    ],
  }),

  listeners(({ actions }) => ({
    loadInboxSuccess: () => actions.refreshInbox(),
    loadInboxFailure: () => actions.refreshInbox(),
    // Straight to GitHub, deliberately - see the note above the logic. The rows on screen stay
    // where they are until the answer for the new settings lands.
    setFilter: () => actions.refreshInbox(),
  })),
]);
