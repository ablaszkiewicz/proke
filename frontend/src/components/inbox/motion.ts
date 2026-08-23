import type { Transition } from "motion/react";

/**
 * The inbox's motion, in one place so the rows, the sections and the piles cannot drift apart.
 *
 * ## What changed, and why the old note here said the opposite
 *
 * This file used to argue that there should be no entrance at all for the rows the page first
 * paints with - that a fade in front of somebody's data is a cost paid twenty times a day for a
 * flourish that is interesting once. That argument holds only while the page is blank until the
 * data lands, which is what it used to be.
 *
 * It is not blank any more. Every section heading renders on the first frame, empty, so the
 * shape of the page is there before the rows are and the cascade fills a layout somebody can
 * already read rather than delaying its arrival. The rows still land within about half a second
 * of the snapshot; what the stagger buys is that they land *in an order*, which is what makes a
 * list read as one thing arriving rather than a block appearing.
 *
 * The later correction from GitHub is unchanged and still the point: a row that arrives once
 * somebody is reading gets an entrance of its own, with no delay in front of it, because it is
 * the one moment on this page where movement is telling them something.
 *
 * Every number below was settled against a set of sliders that no longer exists. They are
 * constants rather than anything configurable because there is one right answer to each of them
 * and it has been chosen - a dial left in the code after the choice is made is a decision nobody
 * has to defend.
 */

/** The curve everything else in this app already moves on. See index.css. */
const EASE = [0.2, 0.7, 0.2, 1] as const;

/**
 * How a row moves when something arrives above it or leaves from under it.
 *
 * The whole reason `layout` is worth having: a pull request landing at the top of a section
 * should push the rest down rather than teleport them, so somebody mid-sentence can see what
 * happened instead of finding the line they were reading somewhere else.
 */
export const LAYOUT_TRANSITION: Transition = {
  duration: 0.26,
  ease: EASE,
};

/** Leaving is quicker than arriving, and carries no travel - a merged row simply stops being. */
export const EXIT_TRANSITION: Transition = { duration: 0.14 };

/**
 * The first cascade, in two steps rather than one.
 *
 * A row's delay is SECTION_STEP_S per section above it that had rows, plus ROW_STEP_S per row
 * above it inside its own. Two numbers, because what is being described is two rhythms at once:
 * rows tick past quickly inside a section, and a section waits for the one before it to have got
 * going. A single combined step can produce either of those but not both.
 */
const ROW_STEP_S = 0.045;
const SECTION_STEP_S = 0.11;

/** How long one row takes to arrive, once it starts, and how far it comes from. */
const ENTER_DURATION_S = 0.42;
export const ENTER_TRAVEL_PX = -8;

/**
 * Nothing starts later than this, however long the column is.
 *
 * The cap is what keeps a full inbox from taking four seconds to finish arriving. Rows past it
 * land together, which is visible but only at the bottom of a list nobody has scrolled to yet.
 */
const MAX_DELAY_S = 0.9;

/**
 * Where in the cascade a row sits.
 *
 * `sectionIndex` counts sections that had rows, not sections: an empty Approved between two full
 * ones must not spend a beat of the stagger on nothing, because what somebody watches is the
 * rows. A negative index is a row arriving on its own rather than as part of the first wave.
 */
export function cascadeDelay(sectionIndex: number, rowIndex: number): number {
  if (sectionIndex < 0) {
    return 0;
  }

  return Math.min(
    sectionIndex * SECTION_STEP_S + rowIndex * ROW_STEP_S,
    MAX_DELAY_S
  );
}

/**
 * An arrival.
 *
 * The delay is written into each property rather than left at the top level, because a `layout`
 * animation shares this object and a layout shift must never be held back - the row under an
 * arriving one moves at the moment the arrival is inserted, not when it fades in.
 */
export function enterTransition(delay: number): Transition {
  return {
    layout: LAYOUT_TRANSITION,
    opacity: { duration: ENTER_DURATION_S * 0.72, delay, ease: "easeOut" },
    y: { duration: ENTER_DURATION_S, delay, ease: EASE },
  };
}
