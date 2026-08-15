import { cn } from "@/lib/utils";

/**
 * A real checkbox rather than a styled div: it reads as checked-and-disabled to a screen
 * reader, which is exactly what it is. `readOnly` keeps React quiet about a checked input with
 * no change handler.
 */
export function LockedCheckbox({ className }: { className?: string }) {
  return (
    <input
      type="checkbox"
      checked
      disabled
      readOnly
      className={cn(
        "size-4 shrink-0 accent-emerald-500 cursor-not-allowed",
        className
      )}
    />
  );
}
