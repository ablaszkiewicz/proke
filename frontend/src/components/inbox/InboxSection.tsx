import { cn } from "@/lib/utils";
import { useState } from "react";
import { InboxRow } from "./InboxRow";
import type { MockPullRequest } from "./mock";

/**
 * A titled group of pull requests.
 *
 * The heading is the toggle, and carries no label saying so. A control reading "hide" was the
 * loudest thing on a page whose entire argument is restraint, and a shut section already
 * announces itself by having no rows under it.
 */
export function InboxSection({
  sectionKey,
  title,
  rows,
}: {
  sectionKey: string;
  title: string;
  rows: MockPullRequest[];
}) {
  // Open unless it is drafts, which are a note to yourself rather than a queue.
  const [open, setOpen] = useState(sectionKey !== "drafts");

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
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {title}
      </button>

      {open ? (
        <ul>
          {rows.map((row) => (
            <InboxRow key={row.id} pullRequest={row} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
