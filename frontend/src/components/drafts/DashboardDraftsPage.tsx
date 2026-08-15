import { cn } from "@/lib/utils";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, type ComponentType } from "react";
import { BentoDraft } from "./drafts/BentoDraft";
import { FeedDraft } from "./drafts/FeedDraft";
import { MatrixDraft } from "./drafts/MatrixDraft";
import { MinimalDraft } from "./drafts/MinimalDraft";
import { PipelineDraft } from "./drafts/PipelineDraft";
import { SplitDraft } from "./drafts/SplitDraft";

interface Draft {
  name: string;
  note: string;
  component: ComponentType;
}

export const DRAFTS: Draft[] = [
  { name: "Minimal", note: "The home page, signed in. This is the real one.", component: MinimalDraft },
  { name: "Split", note: "Accounts left, kinds right.", component: SplitDraft },
  { name: "Matrix", note: "Accounts × kinds. Hover a column.", component: MatrixDraft },
  { name: "Feed", note: "The Slack feed you'd get.", component: FeedDraft },
  { name: "Bento", note: "One surface of tiles.", component: BentoDraft },
  { name: "Pipeline", note: "Sources → events → Slack. Hover an event.", component: PipelineDraft },
];

/**
 * Five takes on the same screen, switchable with the bar at the bottom or the keyboard. Mock
 * data throughout - this is about layout, not wiring. The bar takes real space rather than
 * floating, so what is above it is exactly the viewport a draft has to fit in.
 */
export function DashboardDraftsPage() {
  const { d } = useSearch({ from: "/drafts" });
  const navigate = useNavigate({ from: "/drafts" });
  const index = Math.min(Math.max(d, 1), DRAFTS.length) - 1;

  const select = (next: number) => {
    const wrapped = ((next % DRAFTS.length) + DRAFTS.length) % DRAFTS.length;
    void navigate({ search: { d: wrapped + 1 }, replace: true });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const digit = Number(event.key);

      if (digit >= 1 && digit <= DRAFTS.length) {
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

  const Draft = DRAFTS[index].component;

  return (
    <div className="grid h-dvh w-full grid-rows-[1fr_auto] overflow-hidden">
      <div className="min-h-0 overflow-hidden">
        <Draft />
      </div>

      <nav className="flex items-center justify-center gap-1 border-t px-4 py-1.5 text-xs">
        {DRAFTS.map((draft, i) => (
          <button
            key={draft.name}
            type="button"
            onClick={() => select(i)}
            className={cn(
              "rounded-md px-2.5 py-1 transition-colors",
              i === index
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="mr-1.5 opacity-50">{i + 1}</span>
            {draft.name}
          </button>
        ))}
        <span className="ml-4 text-muted-foreground/60">
          {DRAFTS[index].note} · ←/→ or 1–{DRAFTS.length}
        </span>
      </nav>
    </div>
  );
}
