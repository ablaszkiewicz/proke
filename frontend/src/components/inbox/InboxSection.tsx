import type { InboxSectionData } from "@/lib/api/inbox.api";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { InboxRow } from "./InboxRow";
import { EXIT_TRANSITION, LAYOUT_TRANSITION } from "./motion";
import { CLOSED_BY_DEFAULT, SECTION_TITLES } from "./sections";

/**
 * A titled group of pull requests.
 *
 * The heading is the toggle, and carries no label saying so. A control reading "hide" was the
 * loudest thing on a page whose entire argument is restraint, and a shut section already
 * announces itself by having no rows under it.
 *
 * Whether an empty section is drawn at all is the pile's decision, not this one. Returning null
 * from in here left AnimatePresence holding a child that rendered nothing, which it cannot tell
 * from a child that is still there - so a section emptying never animated out.
 */
export function InboxSection({
  section,
  animateEntrances,
}: {
  section: InboxSectionData;
  /** See InboxPage: false until the page has painted, so the first rows simply exist. */
  animateEntrances: boolean;
}) {
  const [open, setOpen] = useState(!CLOSED_BY_DEFAULT.includes(section.key));

  return (
    // `layout="position"`, never plain `layout`. See the note on the list below.
    <motion.section
      layout="position"
      initial={animateEntrances ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: EXIT_TRANSITION }}
      transition={{ layout: LAYOUT_TRANSITION, opacity: { duration: 0.22 } }}
      className="mb-8 last:mb-0"
    >
      {/* Not a motion element: it sits at the top of the section and never moves relative
          to it, so animating it can only ever fight the section that is already moving it. */}
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
            {section.pullRequests.map((pullRequest) => (
              <InboxRow
                key={pullRequest.id}
                pullRequest={pullRequest}
                animateEntrance={animateEntrances}
              />
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </motion.section>
  );
}
