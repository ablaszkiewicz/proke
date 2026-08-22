import { cn } from "@/lib/utils";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, type ComponentType } from "react";
import { InboxPage } from "./InboxPage";
import { BoardInbox } from "./variants/BoardInbox";
import { GridInbox } from "./variants/GridInbox";
import { PaperInbox } from "./variants/PaperInbox";
import { StreamInbox } from "./variants/StreamInbox";
import { TerminalInbox } from "./variants/TerminalInbox";

interface Variant {
  name: string;
  /** What this one is actually testing, in the fewest words that still say something. */
  note: string;
  component: ComponentType;
}

export const VARIANTS: Variant[] = [
  {
    name: "Columns",
    note: "The base. Two piles, hard rules, GitHub's canvas.",
    component: InboxPage,
  },
  {
    name: "Terminal",
    note: "One column, all text. The densest this can get.",
    component: TerminalInbox,
  },
  {
    name: "Paper",
    note: "Light and airy. Separation by space, not borders.",
    component: PaperInbox,
  },
  {
    name: "Board",
    note: "Sections as columns of cards. Shape over order.",
    component: BoardInbox,
  },
  {
    name: "Stream",
    note: "No piles. One ranked queue, each row a sentence.",
    component: StreamInbox,
  },
  {
    name: "Grid",
    note: "One wide table. Full-width titles, pile as a column.",
    component: GridInbox,
  },
];

/**
 * Six takes on the same screen, switchable with the bar at the bottom or the keyboard.
 *
 * Same shape as the dashboard drafts gallery next door, and for the same reason: all of them run
 * on one fixed set of mock rows, so what differs between two of them is the design and nothing
 * else. The bar takes real space rather than floating, so what is above it is exactly the
 * viewport a variant has to fit in.
 */
export function InboxGallery() {
  const { v } = useSearch({ from: "/inbox" });
  const navigate = useNavigate({ from: "/inbox" });
  const index = Math.min(Math.max(v, 1), VARIANTS.length) - 1;

  const select = (next: number) => {
    const wrapped =
      ((next % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;
    void navigate({ search: { v: wrapped + 1 }, replace: true });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const digit = Number(event.key);

      if (digit >= 1 && digit <= VARIANTS.length) {
        select(digit - 1);
      } else if (event.key === "ArrowRight") {
        select(index + 1);
      } else if (event.key === "ArrowLeft") {
        select(index - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // `select` closes over nothing that changes but `index`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const Variant = VARIANTS[index].component;

  return (
    <div className="grid h-dvh w-full grid-rows-[1fr_auto] overflow-hidden">
      {/* Keyed, so switching variants remounts rather than reconciling one layout into the
          next - the entrance cascade is half of what each of these is showing off. */}
      <div key={index} className="min-h-0 overflow-auto">
        <Variant />
      </div>

      <nav className="flex flex-wrap items-center justify-center gap-1 border-t px-4 py-1.5 text-xs">
        {VARIANTS.map((variant, i) => (
          <button
            key={variant.name}
            type="button"
            onClick={() => select(i)}
            className={cn(
              "px-2.5 py-1 transition-colors",
              i === index
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="mr-1.5 opacity-50">{i + 1}</span>
            {variant.name}
          </button>
        ))}
        <span className="ml-4 text-muted-foreground/60">
          {VARIANTS[index].note} · ←/→ or 1–{VARIANTS.length}
        </span>
      </nav>
    </div>
  );
}
