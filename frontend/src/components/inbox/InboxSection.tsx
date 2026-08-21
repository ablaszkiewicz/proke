import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import { ChevronIcon } from "./icons";

export interface InboxSectionProps {
  title: string;
  /**
   * Not rendered - the rows underneath are the count, and a number beside the title is the same
   * fact told twice. Kept because the section still has to know whether it is empty, which is
   * the one thing the rows cannot say once they are collapsed.
   */
  count: number;
  /** Drafts arrive closed: they are yours to remember, not yours to act on. */
  defaultOpen?: boolean;
  /** Shown in place of the list when the section is open and has nothing in it. */
  emptyText?: string;
  children: ReactNode;
}

/**
 * One titled, collapsible group of rows.
 *
 * The header stays put when the section is closed, so a collapsed section still says the pile
 * exists - which is the whole reason drafts are allowed to start shut.
 */
export function InboxSection({
  title,
  count,
  defaultOpen = true,
  emptyText = "Nothing here.",
  children,
}: InboxSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-b border-border/60 last:border-b-0">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-accent/40"
        >
          <ChevronIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
          <span className="text-sm font-medium">{title}</span>
        </button>
      </h3>

      {open ? (
        count > 0 ? (
          <ul className="pb-2">{children}</ul>
        ) : (
          <p className="animate-fade-in px-4 pb-4 pt-1 text-xs text-muted-foreground">
            {emptyText}
          </p>
        )
      ) : null}
    </section>
  );
}
