import { actions, kea, listeners, path, reducers, selectors } from "kea";
import { loaders } from "kea-loaders";

import {
  InboxWarmApi,
  isKeptWarm,
  sameBuildFilters,
  type InboxBuildFilters,
  type InboxWarmPin,
  type InboxWarmResult,
} from "../api/inbox.api";
import { authLogic } from "./authLogic";

import type { inboxWarmLogicType } from './inboxWarmLogicType'

/** Nothing read yet. `max` is only ever the server's answer, so this stands in until one comes. */
const EMPTY: InboxWarmResult = { pins: [], max: 0 };

/** What the toast is offering to put back, and enough to say so. */
export interface WarmUndo {
  filters: InboxBuildFilters;
  /** Bumped per removal so a second one replaces the first toast rather than stacking behind it. */
  id: number;
}

/**
 * The views being kept ready.
 *
 * Separate from inboxLogic on purpose. That one is about the rows and has a lifecycle to match -
 * it reloads whenever the address bar moves. This is a small list that changes only when somebody
 * presses something, and folding it in would have every filter change dragging it along.
 *
 * ## Why the writes are optimistic
 *
 * Because both of them are a switch, and a switch that waits for a round trip before moving is a
 * switch people press twice. The server is the authority and every route answers with the whole
 * list, so the optimistic value is replaced by the truth a moment later - and a failure replaces
 * it with the truth as well, which is what makes being wrong for 200ms safe rather than a state
 * to reconcile.
 *
 * ## Why a removal is sent immediately rather than held for the undo window
 *
 * Holding it would leave the pin in a state nothing agrees about: still stored, still being swept
 * every five minutes, and gone from the panel - and a closed tab halfway through the window would
 * make which of those was true a matter of timing. Sent now, undo is an ordinary add into the
 * slot the removal just freed, and the worst case is honest: another tab took the slot first, the
 * add is refused, and the toast says so.
 */
export const inboxWarmLogic = kea<inboxWarmLogicType>([
  path(["src", "lib", "logics", "inboxWarmLogic"]),

  actions({
    /**
     * Keep this view ready. No-op where it already is - the server says so either way.
     *
     * `viaUndo` is carried because a refusal means two different sentences: an ordinary press
     * that is refused is "you are already keeping the most you can", and an undo that is refused
     * is "the slot you freed was taken". kea's `addWarmFailure` does not carry the payload that
     * started it, so this is remembered in a reducer rather than read back off the failure.
     */
    keepWarm: (filters: InboxBuildFilters, viaUndo = false) => ({ filters, viaUndo }),
    /** Stop keeping it. Offers an undo rather than asking first. */
    dropWarm: (filters: InboxBuildFilters) => ({ filters }),
    /** Put back what the toast is holding. */
    undoDrop: true,
    dismissUndo: true,
    /** Something the server refused, in the words that fit which thing it was. */
    notify: (message: string) => ({ message }),
  }),

  loaders(({ values }) => ({
    result: [
      EMPTY,
      {
        loadWarm: async (): Promise<InboxWarmResult> => {
          const jwtToken = authLogic.values.jwtToken;

          if (!jwtToken) {
            return EMPTY;
          }

          return InboxWarmApi.list(jwtToken);
        },
        /**
         * Both writes answer with the whole list, so there is nothing to merge.
         *
         * A failure returns what is currently held rather than throwing on: the reducer below
         * has already moved the switch optimistically, and the honest correction is the list the
         * server last agreed to. `loadWarm` behind it settles anything this could not.
         */
        addWarm: async ({
          filters,
        }: {
          filters: InboxBuildFilters;
        }): Promise<InboxWarmResult> => {
          const jwtToken = authLogic.values.jwtToken;

          if (!jwtToken) {
            return values.result;
          }

          return InboxWarmApi.add(jwtToken, filters);
        },
        removeWarm: async ({
          filters,
        }: {
          filters: InboxBuildFilters;
        }): Promise<InboxWarmResult> => {
          const jwtToken = authLogic.values.jwtToken;

          if (!jwtToken) {
            return values.result;
          }

          return InboxWarmApi.remove(jwtToken, filters);
        },
      },
    ],
  })),

  reducers({
    /**
     * The switch moves now and the server corrects it in a moment.
     *
     * Only `pins` is touched optimistically. `max` is the server's alone - guessing it would let
     * the panel say "3 of 3" to somebody whose cap had been changed under them, which is the one
     * number in here nobody could sanity-check by looking.
     */
    result: [
      EMPTY,
      {
        keepWarm: (state, { filters }) =>
          isKeptWarm(state.pins, filters)
            ? state
            : {
                ...state,
                // `pinnedAt` is a placeholder the server overwrites within the round trip. It is
                // never compared - the list sorts by key - so a wrong one is invisible.
                pins: [
                  ...state.pins,
                  { key: optimisticKey(filters), filters, pinnedAt: new Date().toISOString() },
                ].sort((left, right) => left.key.localeCompare(right.key)),
              },
        dropWarm: (state, { filters }) => ({
          ...state,
          pins: state.pins.filter((pin) => !sameBuildFilters(pin.filters, filters)),
        }),
      },
    ],
    /**
     * What the toast is offering, or nothing.
     *
     * Cleared the moment the undo is pressed rather than when its request lands, so the toast
     * goes at the press. If the add then fails, `undoFailed` puts a different toast up saying so
     * - which is a better sequence than a toast that sits there looking pressable while a
     * request it already sent is failing.
     */
    undo: [
      null as WarmUndo | null,
      {
        dropWarm: (state, { filters }) => ({ filters, id: (state?.id ?? 0) + 1 }),
        undoDrop: () => null,
        dismissUndo: () => null,
        // Keeping something new is a different intention from the removal a second ago, and the
        // offer to reverse it should not outlive it.
        keepWarm: () => null,
      },
    ],
    /**
     * What the server refused, if anything. Cleared by whatever happens next, because a refusal
     * is about the press that caused it and stops being true the moment there is another one.
     */
    notice: [
      null as string | null,
      {
        notify: (_, { message }) => message,
        keepWarm: () => null,
        dropWarm: () => null,
        dismissUndo: () => null,
      },
    ],
    /**
     * Whether the add currently in flight is an undo.
     *
     * Deliberately not cleared on `addWarmFailure`: reducers run before listeners, so clearing it
     * there would hide it from the listener that is about to ask.
     */
    undoInFlight: [
      false,
      {
        keepWarm: (_, { viaUndo }) => viaUndo,
        addWarmSuccess: () => false,
        dropWarm: () => false,
      },
    ],
  }),

  selectors({
    pins: [(s) => [s.result], (result: InboxWarmResult): InboxWarmPin[] => result.pins],
    max: [(s) => [s.result], (result: InboxWarmResult): number => result.max],
    /**
     * Whether the list has been read at all.
     *
     * What stops the switch showing "off" for the moment before the answer arrives. Off and
     * not-known-yet draw as the same thing and mean opposite things, and flipping to on a beat
     * later is a brief lie about somebody's own setting.
     */
    loaded: [
      (s) => [s.result],
      // `max` alone, because the server sends it on every answer and never sends nought. Adding
      // "or there are pins" would have read as loaded during an optimistic press made before the
      // first answer arrived - and drawn the count as "1/0".
      (result: InboxWarmResult): boolean => result.max > 0,
    ],
    full: [
      (s) => [s.result],
      (result: InboxWarmResult): boolean =>
        result.max > 0 && result.pins.length >= result.max,
    ],
  }),

  listeners(({ actions, values }) => ({
    keepWarm: ({ filters }) => actions.addWarm({ filters }),
    dropWarm: ({ filters }) => actions.removeWarm({ filters }),
    undoDrop: () => {
      const undo = values.undo;

      if (undo) {
        actions.keepWarm(undo.filters, true);
      }
    },
    /**
     * A refused write is the one case the optimistic value cannot correct itself from, because
     * what came back is an error rather than a list. Reading it again is the only way back to
     * the truth, and it is one small request.
     *
     * Both messages name the cap rather than the status code, because at capacity is the only
     * way either of these is reached in practice: the control disables itself at the cap, so
     * getting here at all means a second tab moved first.
     */
    addWarmFailure: () => {
      actions.notify(
        values.undoInFlight
          ? "Could not put that back — the slot was taken elsewhere."
          : "Could not keep that — you are already keeping the most you can."
      );
      actions.loadWarm();
    },
    removeWarmFailure: () => {
      actions.notify("Could not stop keeping that.");
      actions.loadWarm();
    },
  })),
]);

/**
 * A key for a pin the server has not answered for yet.
 *
 * Deliberately the same spelling the server uses, so an optimistic row sorts into the position
 * the real one will take and does not jump when the answer lands. It is replaced within the
 * round trip either way - nothing compares it.
 */
function optimisticKey(filters: InboxBuildFilters): string {
  return `includeApproved=${filters.includeApproved ? 1 : 0},recentDrafts=${filters.recentDrafts}`;
}
