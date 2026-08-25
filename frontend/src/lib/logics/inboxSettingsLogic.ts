import { actions, connect, kea, listeners, path, reducers, selectors } from "kea";
import { loaders } from "kea-loaders";

import {
  DEFAULT_INBOX_FILTERS,
  InboxSettingsApi,
  type InboxFilterKey,
  type InboxFilters,
} from "../api/inbox.api";
import { authLogic } from "./authLogic";

import type { inboxSettingsLogicType } from './inboxSettingsLogicType'

/**
 * How the inbox is set, and the one way it changes.
 *
 * ## Where the settings come from
 *
 * The account. They arrive on the profile - `authLogic` reads that before anything under `/app`
 * renders - so there is no request of this logic's own in front of the inbox's first paint, and
 * nothing here loads anything. What this logic does is hold a set of edits on top of what the
 * server last agreed to, and send each edit as it is made.
 *
 * Separate from inboxLogic on purpose. That one is about the rows and what fetching them costs;
 * this is about which rows were asked for. inboxLogic is told the settings through `setFilters`
 * and decides for itself what a change means, exactly as it did when the address bar was
 * telling it - see Inbox.
 *
 * ## Why the writes are optimistic
 *
 * Because every setting is a switch, and a switch that waits for a round trip before moving is
 * a switch people press twice. The edit takes effect on screen at the press; the server's answer
 * replaces it a moment later, and on the rare failure the edit is dropped and the page goes back
 * to what the server last agreed to, with a line saying so. Being wrong for 200ms is safe
 * because the server is the authority and every answer is the whole set.
 *
 * ## Why the whole set is sent
 *
 * Because what is stored must never be a matter of what the two sides happen to agree the
 * default is - the same rule every inbox request follows. Two presses in quick succession each
 * send the set as it stood at that press, and the breakpoint drops the earlier answer if a
 * later save has started, so the last thing on screen is the last thing saved.
 */
export const inboxSettingsLogic = kea<inboxSettingsLogicType>([
  path(["src", "lib", "logics", "inboxSettingsLogic"]),

  connect(() => ({
    values: [authLogic, ["userData"]],
    actions: [authLogic, ["logout"]],
  })),

  actions({
    /** Move one setting. Takes effect now; the save follows. */
    setFilter: (key: InboxFilterKey, value: InboxFilters[InboxFilterKey]) => ({
      key,
      value,
    }),
    /** The whole set as it now stands on screen, ahead of the server agreeing. */
    edit: (filters: InboxFilters) => ({ filters }),
    dismissNotice: true,
  }),

  loaders(({ values }) => ({
    /**
     * What the server last answered with, or nothing until it has answered once this session.
     *
     * Only ever the server's own answer, never the optimistic set: the lists come back lowercased
     * and deduplicated, and the page should show what was actually stored rather than what was
     * typed.
     */
    savedByServer: [
      null as InboxFilters | null,
      {
        saveSettings: async (
          { filters }: { filters: InboxFilters },
          breakpoint
        ): Promise<InboxFilters | null> => {
          const jwtToken = authLogic.values.jwtToken;

          if (!jwtToken) {
            return values.savedByServer;
          }

          const saved = await InboxSettingsApi.update(jwtToken, filters);
          // Drops this answer if a newer save started while it was in flight, so a slow one
          // cannot land on top of a fast one that came after it.
          breakpoint();

          return saved;
        },
      },
    ],
  })),

  reducers({
    savedByServer: [
      null as InboxFilters | null,
      {
        // Or the next person to sign in on this browser opens the inbox on this one's settings
        // for the moment before their own profile arrives.
        logout: () => null,
      },
    ],
    /**
     * The set on screen while a save is in flight, or nothing when the screen agrees with the
     * server.
     *
     * Cleared by the server's answer either way. On success the answer is what to show; on
     * failure the last agreed set is, which is what "reverting" means here - there is no undo to
     * apply, only an overlay to take away.
     */
    edited: [
      null as InboxFilters | null,
      {
        edit: (_, { filters }) => filters,
        saveSettingsSuccess: () => null,
        saveSettingsFailure: () => null,
        logout: () => null,
      },
    ],
    /**
     * A save the server refused, in words, or nothing. Cleared by whatever happens next: a
     * refusal is about the press that caused it and stops being true at the next one.
     */
    notice: [
      null as string | null,
      {
        saveSettingsFailure: () =>
          "Couldn't save that setting, so it's back to how it was.",
        setFilter: () => null,
        dismissNotice: () => null,
      },
    ],
  }),

  selectors({
    /**
     * What the server has agreed to, from wherever it last said so.
     *
     * The profile's copy is the starting point and a save's answer overrides it. A selector
     * rather than a reducer seeded at mount, because the profile may have been read before this
     * logic mounted - somebody arriving from the dashboard - or after it, on a cold open, and a
     * selector is right in both orders without either having to know about the other.
     */
    saved: [
      (s) => [s.savedByServer, s.userData],
      (
        savedByServer: InboxFilters | null,
        userData: { inboxSettings?: InboxFilters } | null
      ): InboxFilters | null => savedByServer ?? userData?.inboxSettings ?? null,
    ],
    /**
     * Whether the account has been read. Until it has, the page holds the defaults and asks for
     * nothing - a request made under settings about to be replaced would be a wasted trip and,
     * for a build filter, a wasted trip to GitHub.
     */
    loaded: [(s) => [s.saved], (saved: InboxFilters | null): boolean => saved !== null],
    /** The set the page shows and every inbox request is made under. Complete, never partial. */
    filters: [
      (s) => [s.edited, s.saved],
      (edited: InboxFilters | null, saved: InboxFilters | null): InboxFilters =>
        edited ?? saved ?? DEFAULT_INBOX_FILTERS,
    ],
  }),

  listeners(({ actions, values }) => ({
    setFilter: ({ key, value }) => {
      const next = { ...values.filters, [key]: value } as InboxFilters;

      actions.edit(next);
      actions.saveSettings({ filters: next });
    },
  })),
]);
