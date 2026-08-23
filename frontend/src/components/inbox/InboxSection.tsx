import type { InboxSectionData } from "@/lib/api/inbox.api";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { InboxRow } from "./InboxRow";
import { cascadeDelay, EXIT_TRANSITION, LAYOUT_TRANSITION } from "./motion";
import { CLOSED_BY_DEFAULT, SECTION_TITLES } from "./sections";

/**
 * A titled group of pull requests.
 *
 * The heading is the toggle, and carries no label saying so. A control reading "hide" was the
 * loudest thing on a page whose entire argument is restraint, and a shut section already
 * announces itself by having no rows under it.
 *
 * ## Drawn empty, but only until it has been answered
 *
 * A section renders before it has anything in it, and that is what makes the entrance work: the
 * headings are the page's layout, and they are on screen from the first frame for the rows to
 * cascade into. Which of them survives being answered is the pile's decision, not this one -
 * a section that turns out to have nothing in it is dropped there, not here.
 *
 * Which is why this can exit. `animateIn` is off for the sections that make up that first
 * skeleton, because those are the frame rather than something arriving into it; a section that
 * mounts later, when a bot finally opens something, has arrived and fades in like a row.
 */
export function InboxSection({
  section,
  cascadeIndex,
  animateIn,
}: {
  section: InboxSectionData;
  /**
   * How many sections above this one had rows to show, or -1 for a section whose rows are
   * arriving on their own rather than as part of the first cascade. See InboxPage.
   */
  cascadeIndex: number;
  /** False for the sections the page is first drawn with. They are the layout, not an arrival. */
  animateIn: boolean;
}) {
  const [open, setOpen] = useState(!CLOSED_BY_DEFAULT.includes(section.key));

  return (
    // `layout="position"`, never plain `layout`. See the note on the list below.
    <motion.section
      layout="position"
      initial={animateIn ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: EXIT_TRANSITION }}
      transition={{ layout: LAYOUT_TRANSITION, opacity: { duration: 0.22 } }}
      className="mb-8 last:mb-0"
    >
      {/* Not a motion element: it sits at the top of the section and never moves relative
          to it, so animating it can only ever fight the section that is already moving it.
          It is also the one thing on this page that must not wait for data. */}
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className={cn(
          "mb-1 block w-full px-3 text-left text-[13px] font-medium tracking-tight transition-colors",
          open
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        {SECTION_TITLES[section.key]}
      </button>

      {open ? (
        /*
          A plain list, and every layout animation on this page is `position` only.

          `layout` animates size as well as position, and it does it with scale transforms that
          children then have to counter-scale out of. Nothing here has a box - no border, no
          background, no shadow - so animating a section's or a list's *size* is invisible when
          it works and a squash when it does not. The only thing an eye tracks is where a heading
          and its rows sit, which is position.

          It was also being animated twice over. A section losing a row and a list losing a row
          are the same fifty-two pixels, and both were animating it while the section was
          simultaneously being pushed down by the section above it growing. Three transforms
          composing on one heading is the artifact.

          The list needs no animation of its own: its height snapping is unobservable, and the
          section *below* it slides to its new place under its own `layout="position"`.
        */
        <ul>
          <AnimatePresence mode="popLayout">
            {section.pullRequests.map((pullRequest, index) => (
              <InboxRow
                key={pullRequest.id}
                pullRequest={pullRequest}
                enterDelay={cascadeDelay(cascadeIndex, index)}
              />
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </motion.section>
  );
}
