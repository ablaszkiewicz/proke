import type { Transition } from "motion/react";

/**
 * The inbox's motion, in one place so the rows, the sections and the piles cannot drift apart.
 *
 * The rule everything here obeys: nothing may delay somebody seeing their data. Which turned out
 * to mean less motion than expected - there is no entrance stagger and no entrance at all for the
 * rows the page first paints with. They are simply there.
 *
 * What is left animates one thing only: the *difference* GitHub reports a second or two later.
 * A pull request that has been merged since the snapshot leaves, a new one arrives, and the rows
 * around them move rather than jump - because that change lands under somebody who is already
 * reading, and is the only moment on this page where motion is telling them something.
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

/** An arrival. Only ever runs for a row that was not on screen when the page first painted. */
export const ENTER_TRANSITION: Transition = {
  layout: LAYOUT_TRANSITION,
  opacity: { duration: 0.22 },
  y: { duration: 0.26, ease: EASE },
};

/** Leaving is quicker than arriving, and carries no travel - a merged row simply stops being. */
export const EXIT_TRANSITION: Transition = { duration: 0.14 };
