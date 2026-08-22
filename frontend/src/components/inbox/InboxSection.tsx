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
    <motion.section
      layout
      initial={animateEntrances ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: EXIT_TRANSITION }}
      transition={{ layout: LAYOUT_TRANSITION, opacity: { duration: 0.22 } }}
      className="mb-8 last:mb-0"
    >
      <motion.button
        layout="position"
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
      </motion.button>

      {open ? (
        /*
          `layout` on the list itself, which is what the exit was missing.

          `popLayout` takes a leaving row out of flow on the first frame of its exit, so the rows
          under it can slide up into the gap - and they do. But the list's own height dropped in
          that same frame, instantly, and everything below the list is in normal document flow
          and simply moved. That was the jump: the rows inside were animating and the section
          underneath was not being animated at all, it was being pushed.

          Animating the container's height means what follows it moves smoothly for nothing, and
          the rows counter-scale because they carry `layout` too.
        */
        <motion.ul layout transition={LAYOUT_TRANSITION}>
          <AnimatePresence mode="popLayout">
            {section.pullRequests.map((pullRequest) => (
              <InboxRow
                key={pullRequest.id}
                pullRequest={pullRequest}
                animateEntrance={animateEntrances}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      ) : null}
    </motion.section>
  );
}
