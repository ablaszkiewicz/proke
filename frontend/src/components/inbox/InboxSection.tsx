import type { InboxSectionData } from "@/lib/api/inbox.api";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { InboxRow } from "./InboxRow";
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
 * this is where that becomes a design decision rather than an API one.
 */
export function InboxSection({ section }: { section: InboxSectionData }) {
  const [open, setOpen] = useState(!CLOSED_BY_DEFAULT.includes(section.key));

  if (section.pullRequests.length === 0) {
    return null;
  }

  return (
    <section className="mb-8 last:mb-0">
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
        <ul>
          {section.pullRequests.map((pullRequest) => (
            <InboxRow key={pullRequest.id} pullRequest={pullRequest} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
