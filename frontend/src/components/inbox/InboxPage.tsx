import type { InboxSectionData } from "@/lib/api/inbox.api";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import type { ReactNode } from "react";
import { FilterIcon } from "./icons";
import { InboxSection } from "./InboxSection";
import { LAYOUT_TRANSITION } from "./motion";

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
}

/** Looks like the real control, does nothing yet. The only chrome on the page. */
function ReposControl() {
  return (
    <button
      type="button"
      onClick={(event) => event.preventDefault()}
      className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <FilterIcon className="size-3.5" />
      All repos
    </button>
  );
}

/** The label over a pile. The smallest type on the page, and the only thing in that register. */
function PileLabel({ children }: { children: string }) {
  return (
    <h2 className="mb-5 px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h2>
  );
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
}: {
  label: string;
  sections: InboxSectionData[];
  empty: ReactNode;
  settled: boolean;
  hasAnswer: boolean;
}) {
  const isEmpty = sections.every(
    (section) => section.pullRequests.length === 0
  );

  return (
    <div className="min-w-0">
      <PileLabel>{label}</PileLabel>

      {/* Sections come and go as piles empty and fill, so they animate the same way rows do. */}
      <AnimatePresence mode="popLayout" initial={false}>
        {sections.map((section) => (
          <InboxSection key={section.key} section={section} />
        ))}
      </AnimatePresence>

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
  );
}

export function InboxPage({
  yours,
  waitingOnYou,
  refreshing,
  stale,
  settled,
  hasAnswer,
  githubReauthRequired,
}: InboxPageProps) {
  return (
    // `reducedMotion="user"` rather than a media query per component: somebody who has asked
    // their system for less motion gets none of this, and still gets every row.
    <MotionConfig reducedMotion="user">
      <div className="theme-ink min-h-dvh w-full bg-background text-foreground">
        {/*
          The only sign that a refresh is running. Indeterminate, because a round trip to another
          API has no progress to report and a bar that filled would be inventing one. One pixel,
          on the top edge, moving nothing - the page under it is already showing real rows.
        */}
        <AnimatePresence>
          {refreshing ? (
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none fixed inset-x-0 top-0 z-20 h-px overflow-hidden"
            >
              <div className="h-full w-[14%] animate-inbox-sweep bg-foreground/50" />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <header className="mx-auto flex max-w-[100rem] items-baseline gap-4 px-8 pb-2 pt-8">
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <Status stale={stale} githubReauthRequired={githubReauthRequired} />
          <ReposControl />
        </header>

        {/*
          Side by side from `xl` up, stacked below it. What you owe other people and what other
          people owe you are different jobs; putting one under the other means the second is only
          ever reached by scrolling past the first.

          Nothing divides them but the gutter, which is why the gutter is wide. A rule down the
          middle would be the only line on the page, and a page that has argued itself down to no
          borders anywhere should not keep one purely to say "these are two things" - the labels
          over each column already say it.
        */}
        <div className="mx-auto grid max-w-[100rem] gap-y-14 px-5 pb-16 pt-6 xl:grid-cols-2 xl:gap-x-28 xl:gap-y-0">
          <Pile
            label="Yours"
            sections={yours}
            empty="Nothing open."
            settled={settled}
            hasAnswer={hasAnswer}
          />
          <Pile
            label="Waiting on you"
            sections={waitingOnYou}
            empty="Nobody is waiting on you."
            settled={settled}
            hasAnswer={hasAnswer}
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
