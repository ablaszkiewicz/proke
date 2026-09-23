import { cn } from "@/lib/utils";

/**
 * The soft edge on a column that continues past it.
 *
 * A gradient from the page's own background to nothing, over the scrolling element rather than
 * on it. `pointer-events-none` so it cannot swallow a click on the row underneath, and `z-10`
 * so it sits above the rows without needing anything else on the page to declare a level.
 *
 * Goes with useScrollEdges, which says when each edge has something past it. Both are siblings
 * of the scrolling element, never a mask on it - see the note on `scroll-area` in index.css.
 */
export function ScrollFade({
  edge,
  show,
}: {
  edge: "top" | "bottom";
  show: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 h-7 transition-opacity duration-200",
        edge === "top"
          ? "top-0 bg-gradient-to-b from-background to-transparent"
          : "bottom-0 bg-gradient-to-t from-background to-transparent",
        show ? "opacity-100" : "opacity-0"
      )}
    />
  );
}
