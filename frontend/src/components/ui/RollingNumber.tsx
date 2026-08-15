import { cn } from "@/lib/utils";

/**
 * A number that rolls to its new value instead of being swapped for it. Every value it can hold
 * is stacked in a column and the column slides, so counting up rolls one way and counting down
 * the other without anything having to work out which.
 *
 * Two details keep it still when it should be:
 *
 * - An invisible copy of the widest value holds the window open, so it is exactly one line tall
 *   at whatever size the surrounding text is, and never changes width as the value does.
 * - Each value is placed a whole line further down *within* a one-line track, rather than the
 *   column being one tall element offset by a fraction of itself. A fraction would change
 *   meaning whenever `max` did, and the digit would slide away and back for no reason.
 */
export function RollingNumber({
  value,
  max = value,
  className,
}: {
  value: number;
  /** The largest value this will ever show; it sets the width. Defaults to the current one. */
  max?: number;
  className?: string;
}) {
  const top = Math.max(max, value, 0);
  const current = Math.min(Math.max(value, 0), top);

  return (
    <span
      className={cn(
        "relative inline-block overflow-hidden text-right align-bottom tabular-nums",
        className
      )}
    >
      <span className="invisible" aria-hidden="true">
        {top}
      </span>

      {/* Read as a column of every number it could be, so the real one is said once instead. */}
      <span className="sr-only">{value}</span>

      <span
        aria-hidden="true"
        className="roll-digits absolute inset-0"
        style={{ transform: `translateY(${current * -100}%)` }}
      >
        {Array.from({ length: top + 1 }, (_, n) => (
          <span
            key={n}
            className="absolute inset-x-0 top-0"
            style={{ transform: `translateY(${n * 100}%)` }}
          >
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}
