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
    // Same hairline as the one splitting the two columns - this is the same kind of
    // boundary. It reads as the stronger line because of its colour, not its weight: two
    // pixels of anything across a full-width page is a bar rather than a rule.
    <section className="border-b border-rule last:border-b-0">
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
              open ? "rotate-0" : "-rotate-90",
            )}
          />
          <span className="text-sm font-medium">{title}</span>
        </button>
      </h3>

      {open ? (
        count > 0 ? (
          // `border-t` as well as `divide-y`: the hairline above the first row is what stops the
          // section's own header from reading as one of them.
          <ul className="divide-y divide-border/60 border-t border-border/60">
            {children}
          </ul>
        ) : (
          <p className="animate-fade-in px-4 pb-4 pt-1 text-xs text-muted-foreground">
            {emptyText}
          </p>
        )
      ) : null}
    </section>
  );
}
