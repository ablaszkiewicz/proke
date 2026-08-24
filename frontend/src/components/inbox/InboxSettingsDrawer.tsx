import type {
  InboxFilterChange,
  InboxFilters,
  InboxTeam,
} from "@/lib/api/inbox.api";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useEffect, useState } from "react";
import {
  AuthorsFilter,
  SwitchFilter,
  TeamsFilter,
  WindowFilter,
} from "./FilterControls";
import { INBOX_FILTER_OPTIONS, type InboxFilterOption } from "./filters";

/**
 * What the inbox is showing, and the one place on this page that changes it.
 *
 * ## Why a drawer rather than the popover this replaced
 *
 * Because every setting in here is a claim about where the rows behind it end up, and the only
 * way to judge one is to move it and watch. A popover covered the right-hand column - half of
 * the thing it was about - so changing a filter meant pressing, reading, and pressing again to
 * see what happened. A drawer takes the space instead of borrowing it: everything stays visible,
 * narrower, and a switch and its consequence are on screen at the same moment.
 *
 * It also stopped being a panel of two switches. Five settings, one of which lists your GitHub
 * teams and one of which is a field you type into, is not a thing to hang off a button in a
 * corner.
 *
 * ## Why the page squishes
 *
 * Nothing had to be told how to. The content is centred inside a maximum width, so taking width
 * from its container re-centres it in what is left - the two columns simply get narrower, and
 * with the drawer shut the page is exactly what it was before this existed.
 *
 * That only works while there is width to take. Below `xl` the columns are already stacked and a
 * phone has none to give, so there the drawer stops squishing and covers instead, over a scrim.
 * Which is the popover's problem again - but on a screen showing one column at a time it was
 * never possible to show both, and pretending otherwise would leave 46 pixels of inbox.
 *
 * ## What is deliberately absent
 *
 * A Save, a Cancel, and a count of what is hidden. The first two because every toggle takes
 * effect immediately - the rows change under the open drawer, and there is nothing to confirm.
 * The third because it reads as a warning about a thing the reader chose, and it would need the
 * server to count rows it was asked not to send.
 */

/**
 * Fixed, and the panel inside is fixed to the same number.
 *
 * Animating a width would otherwise reflow everything inside it on every frame - text rewrapping
 * mid-slide, which reads as the drawer being assembled rather than revealed. This way the panel
 * is laid out once at full size and the aside simply stops clipping it.
 */
const DRAWER_WIDTH = 344;

const TRANSITION = { duration: 0.34, ease: [0.2, 0.7, 0.2, 1] as const };

export function InboxSettingsDrawer({
  open,
  onClose,
  filters,
  teams,
  teamsAsked,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  filters: InboxFilters;
  /** See InboxPage. Undefined is "not established yet", which the panel says rather than draws. */
  teams?: InboxTeam[];
  teamsAsked: boolean;
  /** Applied immediately. There is nothing to confirm. */
  onChange: InboxFilterChange;
}) {
  const squishes = useSquishes();

  useEscapeToClose(open, onClose);

  return (
    <>
      {/*
        Only where the drawer covers rather than squishes. A scrim over a page the drawer has
        made room for would be dimming the very thing somebody opened it to watch.
      */}
      <AnimatePresence>
        {open && !squishes ? (
          <motion.div
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 bg-background/70"
          />
        ) : null}
      </AnimatePresence>

      <motion.aside
        // `initial={false}`, or the drawer plays itself shut on every first paint of the page.
        initial={false}
        animate={
          squishes
            ? { width: open ? DRAWER_WIDTH : 0, x: 0 }
            : { width: DRAWER_WIDTH, x: open ? 0 : DRAWER_WIDTH }
        }
        transition={TRANSITION}
        className={cn(
          "z-40 shrink-0 overflow-hidden border-l border-border/70 bg-background text-foreground",
          squishes ? "relative h-full" : "fixed inset-y-0 right-0 shadow-2xl"
        )}
      >
        <div
          style={{ width: DRAWER_WIDTH }}
          className="flex h-full flex-col"
          // Hidden from everything, not just from sight, when it is shut - or Tab walks into a
          // panel nobody can see and the page scrolls sideways chasing the focus ring.
          inert={!open}
        >
          <DrawerHeader onClose={onClose} />

          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4 pt-1.5">
            {INBOX_FILTER_OPTIONS.map((option, index) => (
              <Fragment key={option.key}>
                {/*
                  A hairline between settings, and only between them - never above the first or
                  below the last, where it would be a second border inside the drawer's own.

                  It is here because two of these controls open into something underneath them,
                  and without a line it is genuinely unclear whether a row of spans belongs to
                  the setting above it or the one below. At `border/60` it is barely a mark:
                  enough to group, not enough to be a feature.
                */}
                {index > 0 ? (
                  <div
                    aria-hidden="true"
                    className="mx-2.5 my-1 h-px bg-border/60"
                  />
                ) : null}

                <Setting
                  option={option}
                  filters={filters}
                  teams={teams}
                  teamsAsked={teamsAsked}
                  onChange={onChange}
                />
              </Fragment>
            ))}
          </div>
        </div>
      </motion.aside>
    </>
  );
}

/**
 * What the drawer is, a way out, and the one thing about these settings nobody would guess.
 *
 * The note is not a disclaimer. Somebody who has just spent a minute unticking teams is owed the
 * fact that closing the tab undoes it, and owed it *before* they find out - and the same sentence
 * carries the thing to do about it. The address bar is the store: everything set here is in it,
 * so a bookmark is the save button, and it is one the reader can also send to somebody else.
 *
 * `pt-9` rather than the header's `pt-8`, because the heading beside it sits on a baseline
 * rather than on the top of its box.
 */
function DrawerHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="shrink-0 border-b border-border/70 px-4 pb-3 pt-9">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-medium tracking-tight text-foreground">
          Settings
        </h2>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className={cn(
            "ml-auto flex size-6 items-center justify-center rounded text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2"
          )}
        >
          <svg
            viewBox="0 0 12 12"
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
        Nothing here is saved. Bookmark the URL to keep these settings.
      </p>
    </div>
  );
}

/** One setting, drawn as whatever kind it is. */
function Setting({
  option,
  filters,
  teams,
  teamsAsked,
  onChange,
}: {
  option: InboxFilterOption;
  filters: InboxFilters;
  teams?: InboxTeam[];
  teamsAsked: boolean;
  onChange: InboxFilterChange;
}) {
  switch (option.kind) {
    case "window":
      return (
        <WindowFilter
          option={option}
          value={filters[option.key]}
          onChange={onChange}
        />
      );
    case "teams":
      return (
        <TeamsFilter
          option={option}
          on={filters[option.key]}
          excluded={filters[option.membersKey]}
          teams={teams}
          asked={teamsAsked}
          onChange={onChange}
        />
      );
    case "authors":
      return (
        <AuthorsFilter
          option={option}
          authors={filters[option.key]}
          onChange={onChange}
        />
      );
    default:
      return (
        <SwitchFilter option={option} filters={filters} onChange={onChange} />
      );
  }
}

/** The same breakpoint the two columns appear at, which is not a coincidence: squishing is worth
 *  doing exactly when there are two columns to squish. */
const WIDE = "(min-width: 80rem)";

/**
 * Whether there is width to take, which is the whole difference between the drawer's two
 * behaviours.
 *
 * A media query rather than a resize listener with a comparison in it: the browser already knows
 * when this changes and will say so.
 *
 * ## Why it is read during the first render rather than in the effect
 *
 * Because it used to be read in the effect, and the page slid sideways every time anybody opened
 * it. The first render believed it was the narrow kind, so the drawer was drawn as an overlay
 * 344 pixels wide; the effect then corrected it to the in-flow kind at zero width, and motion
 * did what it is for and animated the difference. What that looks like is the whole inbox
 * starting a quarter-page to the left and sliding right into place - an entrance nobody asked
 * for, on a page whose entire argument is that nothing may delay somebody seeing their data.
 *
 * Read here, the first paint already knows, `initial={false}` has nothing to animate from, and
 * the drawer is simply shut. A real change of breakpoint still animates, which is correct: that
 * one is a thing that happened rather than a thing we had not got round to asking.
 */
function useSquishes(): boolean {
  const [squishes, setSquishes] = useState(matchesWide);

  useEffect(() => {
    const query = window.matchMedia(WIDE);

    // In case the window changed between that first render and this. Same value is a no-op, so
    // the common path costs nothing and does not re-render.
    setSquishes(query.matches);

    const onChange = (event: MediaQueryListEvent) => setSquishes(event.matches);

    query.addEventListener("change", onChange);

    return () => query.removeEventListener("change", onChange);
  }, []);

  return squishes;
}

/** False where there is no window to ask, which is a render outside a browser and nothing else. */
function matchesWide(): boolean {
  return typeof window !== "undefined" && window.matchMedia(WIDE).matches;
}

/**
 * Escape closes it, and that is the only dismissal it has.
 *
 * A press on the page does not, unlike the popover this replaced - and the difference is the
 * point. The page is not a way out of a drawer that made room for it; it is the thing the drawer
 * is about, and clicking a pull request while reading the settings should open the pull request.
 * Where the drawer covers instead, the scrim is the press-to-dismiss.
 *
 * Focus is not sent anywhere on the way out. The trigger is still in the header where it was,
 * and stealing focus back to it would move somebody who had already put it somewhere else.
 */
function useEscapeToClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
}
