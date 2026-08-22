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
 * An empty section renders nothing at all, heading included. The server sends every section
 * whether or not it has anything in it - so that the shape of the answer never changes - and
 * this is where that becomes a design decision rather than an API one. It is also why the
 * section animates: finishing the last review in a pile makes a heading leave.
 */
export function InboxSection({ section }: { section: InboxSectionData }) {
  const [open, setOpen] = useState(!CLOSED_BY_DEFAULT.includes(section.key));

  if (section.pullRequests.length === 0) {
    return null;
  }

  return (
    <motion.section
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: EXIT_TRANSITION }}
      transition={{ layout: LAYOUT_TRANSITION, opacity: { duration: 0.2 } }}
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
        <ul>
          {/*
            Rows keyed on GitHub's node id, so one arriving mid-list is the only thing that
            animates in - everything already on screen keeps its identity and merely slides.
          */}
          <AnimatePresence mode="popLayout">
            {section.pullRequests.map((pullRequest, index) => (
              <InboxRow
                key={pullRequest.id}
                pullRequest={pullRequest}
                index={index}
              />
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </motion.section>
  );
}
