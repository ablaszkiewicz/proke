import type {
  InboxFilterChange,
  InboxFilters,
  InboxSectionData,
  InboxTeam,
} from "@/lib/api/inbox.api";
import { cn } from "@/lib/utils";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { InboxSection } from "./InboxSection";
import { InboxSettings } from "./InboxSettings";
import { LAYOUT_TRANSITION } from "./motion";
import { useScrollEdges } from "./useScrollEdges";

/**
 * The review inbox.
 *
 * Two piles - your own open pull requests on the left, other people's waiting on you on the
 * right - separated by nothing but the gutter, which is why the gutter is wide. Everything else
 * is ranked by type size.
 *
 * What is deliberately absent is most of the design: no borders round anything, no status
 * glyphs, no counts, no dates, and no sentence anywhere explaining what a section means. Every
 * one of those was tried and taken out again. A row carries a title, where it lives, and who
 * wrote it, because anything more specific is a reason to open it rather than a substitute for
 * doing so.
 *
 * ## No waiting screen
 *
 * The page renders immediately and empty, and rows arrive into it - first from the stored
 * snapshot a few milliseconds later, then corrected from GitHub a second or two after that.
 * Holding a full-screen loader in front of all that traded one flicker for a mandatory pause,
 * which is the worse of the two on a page somebody opens twenty times a day.
 *
 * What stops it flickering instead is that an empty pile says nothing until there is something
 * to say - see `settled`.
 *
 * Presentational: takes data and renders it, so the same page can be driven by the logic next
 * door or by the stopwatch at /mock-inbox.
 */

export interface InboxPageProps {
  yours: InboxSectionData[];
  waitingOnYou: InboxSectionData[];
  /** A trip to GitHub is in flight, behind rows that may already be on screen. */
  refreshing: boolean;
  /** An older answer, served because the refresh behind it failed. */
  stale: boolean;
  /**
   * Whether anything has answered yet.
   *
   * Until it has, an empty pile stays silent. Rendering "Nothing open" against a result that has
   * not arrived is the flicker this page used to have, and it is a confident lie about somebody's
   * workload for as long as it is on screen.
   */
  settled: boolean;
  /**
   * Whether GitHub has ever answered for this person.
   *
   * What separates "nothing to do" from "we could not find out". Only consulted once `settled`.
   */
  hasAnswer: boolean;
  /** proke holds no usable GitHub authorization. Nothing can be refreshed until they reconnect. */
  githubReauthRequired: boolean;
  /**
   * What the reader has chosen to be shown.
   *
   * The rows arriving are already filtered - the server builds the snapshot under these, because
   * every rule behind one needs something a browser cannot see - so this is here to draw the
   * toggles in their right positions and for nothing else.
   */
  filters: InboxFilters;
  /**
   * The teams the "your team" heading is built from, for the settings to list.
   *
   * Comes down with the rows rather than from a request of its own - the server works them out
   * to do the grouping anyway. Undefined until GitHub has answered, which the panel says rather
   * than drawing as an empty list.
   */
  teams?: InboxTeam[];
  /**
   * Takes effect immediately: the address bar is rewritten, and a new answer is fetched behind
   * the rows already on screen.
   */
  onFilterChange: InboxFilterChange;
}

/**
 * One pile, and what it says when it has nothing in it.
 *
 * Three states rather than two, because "we have not looked yet" and "there is nothing" read
 * identically as an empty column and mean opposite things.
 */
function Pile({
  label,
  sections,
  empty,
  settled,
  hasAnswer,
  animateEntrances,
}: {
  label: string;
  sections: InboxSectionData[];
  empty: ReactNode;
  settled: boolean;
  hasAnswer: boolean;
  animateEntrances: boolean;
}) {
  // Filtered here rather than inside the section, so an emptying section leaves
  // AnimatePresence's child list and can be animated out. A child that renders null is
  // indistinguishable, to AnimatePresence, from one that is still there.
  const visible = sections.filter(
    (section) => section.pullRequests.length > 0
  );
  const isEmpty = visible.length === 0;

  const { ref, onScroll, edges } = useScrollEdges<HTMLDivElement>(sections);

  return (
    // A column of its own from `xl` up: only the rows inside it move.
    // `min-h-0` is what lets the body actually shrink - a flex child defaults to its content
    // height, which would push the whole thing past the viewport instead of scrolling.
    //
    // `label` is not printed any more. It stays as the region's accessible name, because the
    // heading that used to be here was the only thing telling somebody who cannot see the
    // layout that these are two piles rather than one long list.
    <div role="region" aria-label={label} className="flex min-w-0 flex-col xl:min-h-0">
      {/*
        `relative`, so the two fades can be positioned over the column without scrolling with it.
        They are siblings of the scrolling element rather than a mask on it - see index.css.
      */}
      <div className="relative flex min-w-0 flex-col xl:min-h-0 xl:flex-1">
        <ScrollFade edge="top" show={edges.top} />
        <ScrollFade edge="bottom" show={edges.bottom} />

        <div
          ref={ref}
          onScroll={onScroll}
          className="scroll-area -mr-2 pr-2 xl:min-h-0 xl:flex-1"
        >

      {/*
        One group across every section in the column.
 
        Layout animations are measured per render, and a row leaving re-renders only the section
        it was in - so the sections below it never got the chance to notice they had moved.
        LayoutGroup is what makes them all measure together whether or not they re-rendered,
        which is precisely the case here.
      */}
      <LayoutGroup>
        {/*
          Also no `initial={false}`. A section has no entrance of its own to suppress, so it
          bought nothing - and PresenceContext reaches every descendant, so it was liable to
          silence the rows inside as well.
        */}
        <AnimatePresence mode="popLayout">
          {visible.map((section) => (
            <InboxSection
              key={section.key}
              section={section}
              animateEntrances={animateEntrances}
            />
          ))}
        </AnimatePresence>
      </LayoutGroup>

      <AnimatePresence>
        {isEmpty && settled ? (
          <motion.p
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ layout: LAYOUT_TRANSITION, opacity: { duration: 0.2 } }}
            className="px-3 text-[13px] text-muted-foreground"
          >
            {hasAnswer ? empty : "Couldn't reach GitHub."}
          </motion.p>
        ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/**
 * The soft edge on a column that continues past it.
 *
 * A gradient from the page's own background to nothing, over the scrolling element rather than
 * on it. `pointer-events-none` so it cannot swallow a click on the row underneath, and `z-10`
 * so it sits above the rows without needing anything else on the page to declare a level.
 */
function ScrollFade({
  edge,
  show,
}: {
  edge: "top" | "bottom";
  show: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 h-7 transition-opacity duration-200",
        edge === "top"
          ? "top-0 bg-gradient-to-b from-background to-transparent"
          : "bottom-0 bg-gradient-to-t from-background to-transparent",
        show ? "opacity-100" : "opacity-0"
      )}
    />
  );
}

/**
 * How long the finish takes, and how long it is left up afterwards.
 *
 * Both are short. This is the ending of an animation nobody is watching on purpose - long
 * enough to be seen completing, not long enough to be waited on.
 */
const SWEEP_FILL_MS = 280;
const SWEEP_HOLD_MS = 140;

type SweepPhase = "idle" | "running" | "finishing";

/**
 * The only sign that a refresh is running, and the only sign that one has ended.
 *
 * Indeterminate while it runs, because a round trip to another API has no progress to report and
 * a bar that filled would be inventing one. One pixel, on the top edge, moving nothing - the
 * page under it is already showing real rows.
 *
 * It does not disappear when the request returns. The segment is somewhere mid-travel at that
 * moment, and cutting it there reported the finish as an absence - on a fast connection, a
 * flicker and nothing else. Instead the line fills the width from the left, under the segment
 * and in the same colour so the two read as one line completing rather than as a swap, and only
 * then fades. The end of the request gets an ending.
 */
function RefreshLine({ refreshing }: { refreshing: boolean }) {
  const phase = useSweepPhase(refreshing);

  return (
    <AnimatePresence>
      {phase === "idle" ? null : (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="pointer-events-none fixed inset-x-0 top-0 z-20 h-px overflow-hidden"
        >
          {phase === "finishing" ? (
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{
                duration: SWEEP_FILL_MS / 1000,
                ease: [0.2, 0.7, 0.2, 1],
              }}
              className="absolute inset-0 origin-left bg-foreground/50"
            />
          ) : null}

          {/*
            Tapered rather than a solid block, and travelling at an even pace. Both ends of its
            journey are off screen - see the keyframes in index.css.
          */}
          <div className="relative h-full animate-inbox-sweep bg-gradient-to-r from-transparent via-foreground/70 to-transparent" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Three states from one boolean: running, finishing, gone.
 *
 * The middle one is what the prop cannot say. `refreshing` goes false the instant the answer
 * lands, and the line still has an ending to play at that point - so the state outlives the
 * request by exactly as long as that ending takes.
 */
function useSweepPhase(refreshing: boolean): SweepPhase {
  const [phase, setPhase] = useState<SweepPhase>("idle");
  const wasRefreshing = useRef(false);

  useEffect(() => {
    if (refreshing) {
      wasRefreshing.current = true;
      setPhase("running");

      return;
    }

    // Nothing to finish if nothing was running. A page that opens with no refresh in flight must
    // not play the ending of an animation it never started.
    if (!wasRefreshing.current) {
      return;
    }

    wasRefreshing.current = false;
    setPhase("finishing");

    // Cleared if another refresh starts inside the window, which puts the line straight back to
    // running rather than letting it fade out from under the next request.
    const timer = setTimeout(() => setPhase("idle"), SWEEP_FILL_MS + SWEEP_HOLD_MS);

    return () => clearTimeout(timer);
  }, [refreshing]);

  return phase;
}

export function InboxPage({
  yours,
  waitingOnYou,
  refreshing,
  stale,
  settled,
  hasAnswer,
  githubReauthRequired,
  filters,
  teams,
  onFilterChange,
}: InboxPageProps) {
  const animateEntrances = useHasPainted(
    yours.some((section) => section.pullRequests.length > 0) ||
      waitingOnYou.some((section) => section.pullRequests.length > 0)
  );

  return (
    // `reducedMotion="user"` rather than a media query per component: somebody who has asked
    // their system for less motion gets none of this, and still gets every row.
    <MotionConfig reducedMotion="user">
      <div
        className={
          // Locked to the viewport from `xl` up, where the two columns are side by side and each
          // can own its own scroll. Stacked below that they are one flowing page again, because
          // two independently scrolling half-height panes on a phone is a worse answer than
          // scrolling.
          "theme-ink flex min-h-dvh w-full flex-col bg-background text-foreground " +
          "xl:h-dvh xl:min-h-0 xl:overflow-hidden"
        }
      >
        <RefreshLine refreshing={refreshing} />

        {/*
          `items-center` on the header and `items-baseline` on the title group, because the two
          jobs are different: the status line sits on the title's baseline, and the settings
          button - which has no baseline worth speaking of - is centred against the whole row.
        */}
        <header className="mx-auto flex w-full max-w-[100rem] shrink-0 items-center gap-4 px-8 pb-2 pt-8">
          <div className="flex min-w-0 items-baseline gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
            <Status stale={stale} githubReauthRequired={githubReauthRequired} />
          </div>

          <div className="ml-auto">
            <InboxSettings
              filters={filters}
              teams={teams}
              teamsAsked={hasAnswer}
              onChange={onFilterChange}
            />
          </div>
        </header>

        {/*
          Side by side from `xl` up, stacked below it. What you owe other people and what other
          people owe you are different jobs; putting one under the other means the second is only
          ever reached by scrolling past the first.

          Nothing divides them but the gutter, which is why the gutter is wide - and now that the
          headings over each column are gone, the gutter is the only thing saying they are two
          piles at all. A rule down the middle would be the only line on the page, and a page that
          has argued itself down to no borders anywhere should not grow one here; the answer to a
          separation that has to work harder is more space, not a mark.

          Which is what the stacked layout gets too: below `xl` the two piles run one under the
          other with nothing between them, so the gap there is wider than the one the headings
          used to sit in.
        */}
        <div
          className={
            "mx-auto grid w-full max-w-[100rem] gap-y-20 px-5 pb-16 pt-8 " +
            "xl:min-h-0 xl:flex-1 xl:grid-cols-2 xl:gap-x-28 xl:gap-y-0 xl:pb-6"
          }
        >
          <Pile
            label="Yours"
            sections={yours}
            empty="Nothing open."
            settled={settled}
            hasAnswer={hasAnswer}
            animateEntrances={animateEntrances}
          />
          <Pile
            label="Waiting on you"
            sections={waitingOnYou}
            empty="Nobody is waiting on you."
            settled={settled}
            hasAnswer={hasAnswer}
            animateEntrances={animateEntrances}
          />
        </div>
      </div>
    </MotionConfig>
  );
}

/**
 * The one line on the page allowed to talk about the page.
 *
 * Only ever says something when there is something wrong; a refresh in flight is reported by
 * the line across the top instead, which says the same thing without a word competing with the
 * title beside it.
 */
function Status({
  stale,
  githubReauthRequired,
}: {
  stale: boolean;
  githubReauthRequired: boolean;
}) {
  if (githubReauthRequired) {
    return (
      <a
        href="/app"
        className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
      >
        Reconnect GitHub to refresh this
      </a>
    );
  }

  if (stale) {
    return (
      <span className="text-xs text-muted-foreground">
        Showing the last answer GitHub gave
      </span>
    );
  }

  return null;
}

/**
 * Whether rows have been on screen once already.
 *
 * What separates the two arrivals this page has. The first is the snapshot, and it must not
 * animate: those rows are the answer somebody opened the page for, and a fade in front of them
 * is a cost paid twenty times a day for something interesting once. The second is GitHub's
 * correction, landing under a reader, where movement is the only thing that says what changed.
 *
 * Decided here rather than by handing AnimatePresence `initial={false}`. That flag reads as if
 * it means this and does not: it suppresses whatever is present when *that* AnimatePresence
 * first renders, and a section only exists once its rows do - so it silenced every entrance
 * forever, including the ones this page exists to show. It also travels down PresenceContext to
 * descendants, which makes where you put it matter in a way nothing on the page reveals.
 */
function useHasPainted(hasRows: boolean): boolean {
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    if (hasRows) {
      setPainted(true);
    }
  }, [hasRows]);

  // False on the render that first draws rows - which is the point - and true from the next one,
  // so anything arriving afterwards animates. Rows already mounted ignore `initial` either way.
  return painted;
}
