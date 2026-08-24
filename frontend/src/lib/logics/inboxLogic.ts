import { actions, kea, listeners, path, reducers, selectors } from "kea";
import { loaders } from "kea-loaders";

import {
  DEFAULT_INBOX_FILTERS,
  INBOX_BUILD_FILTER_KEYS,
  InboxApi,
  sameInboxFilters,
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
 * ## Where the filters come from
 *
 * The address bar, by way of the page - see components/inbox/search.ts. Nothing is stored here
 * and nothing is stored in the browser, so this logic never has an opinion about what the
 * settings are; it is told, and `setFilters` is the only way in.
 *
 * That is also why `setFilters` decides what to do about a change rather than the page deciding.
 * The first one is the page opening on whatever the link was carrying, and the two passes above
 * are exactly what a page opening wants. Every later one is somebody moving a switch, and what
 * that costs depends on which switch - see below. A component holding a "have I mounted yet"
 * flag, or an opinion about which filters are cheap, would be those decisions made somewhere
 * they cannot be read next to their reasons.
 *
 * ## Why a build filter refreshes and a view filter re-reads
 *
 * A snapshot is built under the build filters, so the stored one for the settings you have just
 * switched to is either absent or older than the one on screen. Reading it first would blank the
 * page and then fill it back in; going straight to GitHub leaves every row where it is until the
 * real answer lands, and the rows the filter removes then animate out under somebody who is
 * already looking at them - which is the one moment on this page where movement is telling them
 * something.
 *
 * A view filter is not in that key. The server applies it to the stored snapshot on the way out,
 * so the answer for the new settings is already sitting in its memory: a re-read is a map lookup
 * and comes back in a millisecond, where a refresh would be a round trip to GitHub to be told
 * the same thing. Unticking a team should not cost a second and a half.
 *
 * The one thing a re-read can do that a refresh cannot is find nothing - the snapshot expired,
 * or the process restarted. That is rare by construction rather than certain like the build case
 * is, and `rereadInbox` keeps the rows on screen and asks GitHub instead of showing an empty
 * page. Which is the same two passes the page opens with, arriving late.
 *
 * Ordering is safe either way: all three write the same value, and the two that can be slow drop
 * their answers through breakpoints if a newer one started while they were in flight.
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
    /** What the address bar says the settings are now. The only way filters get in here. */
    setFilters: (filters: InboxFilters) => ({ filters }),
  }),

  loaders(({ actions, values }) => ({
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
        /**
         * The stored snapshot again, under settings the server can answer from the one it has.
         *
         * Distinct from `loadInbox` in what happens afterwards: that one is the page opening and
         * always chains a refresh behind itself, where this one usually has nothing to chain -
         * what came back is the same rows GitHub would give, in different piles.
         *
         * The exception is a read that found nothing, which means the stored snapshot expired
         * under a tab left open or its process restarted. That is handled here rather than in a
         * listener because this is the only place that can see both halves of it at once: the
         * empty answer, and the real rows it would otherwise replace. Keeping those on screen
         * and going to ask is the same two passes the page opens with, arriving late - and it is
         * much better than blanking somebody's inbox to answer a checkbox.
         */
        rereadInbox: async (_: void, breakpoint): Promise<InboxResult> => {
          const jwtToken = authLogic.values.jwtToken;

          if (!jwtToken) {
            return EMPTY;
          }

          const result = await InboxApi.read(jwtToken, values.filters);
          breakpoint();

          if (result.refreshedAt) {
            return result;
          }

          actions.refreshInbox();

          return values.result;
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
     * The settings every request is made under.
     *
     * Complete rather than partial, and not persisted: the page hands over a whole set worked
     * out from the address bar and the defaults, so nothing here ever has to decide what an
     * absent filter meant or what a filter added in a later deploy should be.
     */
    filters: [
      DEFAULT_INBOX_FILTERS as InboxFilters,
      {
        setFilters: (_, { filters }) => filters,
      },
    ],
    /**
     * Whether the page has said what the settings are yet.
     *
     * The one thing separating the page opening from somebody changing something, and the reason
     * `setFilters` can be the only way in. Listeners run after reducers, so the value here is
     * already true by the time the listener sees it - which is what `previousState` is for.
     */
    opened: [
      false,
      {
        setFilters: () => true,
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
    // A re-read that found nothing handles itself - see the loader. This is the other way it can
    // come back without an answer, and it wants the same thing.
    rereadInboxFailure: () => actions.refreshInbox(),
    setFilters: ({ filters }, _breakpoint, _action, previousState) => {
      // The page opening. Read the stored snapshot first; the refresh chains off it above.
      if (!inboxLogic.selectors.opened(previousState)) {
        actions.loadInbox();

        return;
      }

      const previous = inboxLogic.selectors.filters(previousState);

      // The address bar saying again what is already on screen. A router is entitled to hand
      // the same location back - a re-render, a press on the span that is already chosen - and
      // a request per repetition is a cost nobody asked for.
      if (sameInboxFilters(previous, filters)) {
        return;
      }

      // What actually changed decides which of the two it costs. Anything that alters what the
      // server *stored* needs a new answer from GitHub; anything that only alters how the stored
      // answer is served is already in its memory. See the note above the logic.
      if (changedABuildFilter(previous, filters)) {
        actions.refreshInbox();

        return;
      }

      actions.rereadInbox();
    },
  })),
]);

/**
 * Whether the difference between two sets of settings is one the server has to rebuild for.
 *
 * Compared filter by filter rather than by asking which one the panel touched, because the
 * address bar is what feeds this and a navigation can move more than one at a time - a bookmark,
 * a back button, a link somebody sent. One build filter among them is enough.
 *
 * `!==` is sound here and would not be over the whole set: every build filter's value is a
 * boolean or a word, and the two that are lists are both view filters.
 */
function changedABuildFilter(previous: InboxFilters, next: InboxFilters): boolean {
  return INBOX_BUILD_FILTER_KEYS.some((key) => previous[key] !== next[key]);
}
