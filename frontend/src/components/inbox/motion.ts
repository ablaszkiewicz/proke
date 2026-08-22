import type { Transition } from "motion/react";

/**
 * The inbox's motion, in one place so the rows, the sections and the piles cannot drift apart.
 *
 * The rule everything here obeys: nothing may delay somebody seeing their data. An entrance is
 * allowed to be the last thing that happens to a row, never the thing standing in front of it -
 * so rows are laid out and readable from the first frame, and only their opacity and a few
 * pixels of travel are animated over the top.
 */

/** The curve everything else in this app already moves on. See index.css. */
const EASE = [0.2, 0.7, 0.2, 1] as const;

/** Between one row's entrance and the next. Small: sixteen rows should read as one wave. */
const STAGGER_MS = 22;

/**
 * Past this many, rows stop waiting their turn.
 *
 * Without a cap the last row of a long section starts a third of a second after the first, which
 * is exactly the "animation delayed me seeing the data" this is supposed to avoid.
 */
const MAX_STAGGERED = 8;

export function entranceDelay(index: number): number {
  return (Math.min(index, MAX_STAGGERED) * STAGGER_MS) / 1000;
}

/**
 * How a row moves when something arrives above it.
 *
 * The whole reason `layout` is worth having: a pull request landing at the top of a section
 * should push the rest down rather than teleport them, so somebody mid-sentence can see what
 * happened instead of finding the line they were reading somewhere else.
 */
export const LAYOUT_TRANSITION: Transition = {
  duration: 0.26,
  ease: EASE,
};

export function rowTransition(index: number): Transition {
  return {
    layout: LAYOUT_TRANSITION,
    opacity: { duration: 0.2, delay: entranceDelay(index) },
    y: { duration: 0.24, delay: entranceDelay(index), ease: EASE },
  };
}

/** Leaving is quicker than arriving, and carries no travel - a merged row simply stops being. */
export const EXIT_TRANSITION: Transition = { duration: 0.14 };
