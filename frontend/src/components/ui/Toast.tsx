import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A line that says what just happened, and sometimes offers to take it back.
 *
 * ## Why this exists rather than a confirmation
 *
 * Because the thing it reports - a kept view being dropped - is one press, costs nothing to
 * redo, and is not dangerous. Asking "are you sure?" first taxes every correct press to protect
 * against the rare wrong one. Doing it and offering the way back taxes only the mistake.
 *
 * ## Why it is a portal
 *
 * The drawer it is dismissed from has `inert` on it when shut and lives inside a container that
 * clips. A toast rendered in place would be clipped by the first and hidden by the second the
 * moment the drawer closed - which is exactly when it is most likely to be on screen, because
 * closing the drawer is a reasonable thing to do right after removing something from it.
 *
 * ## The timing, which is the part that matters
 *
 * Six seconds, not the usual four. Four is enough to read a line; it is not enough to read a
 * line, decide it was a mistake, and reach the button - and a toast whose undo expires before
 * anybody can press it is a toast pretending to offer something.
 *
 * The countdown pauses on hover and on focus, so reading it slowly and tabbing to the button
 * both stop the clock. Without that, keyboard users get the shortest window of anybody.
 *
 * `role="status"` with `aria-live="polite"` rather than an alert: this is worth saying, and not
 * worth interrupting whatever a screen reader was in the middle of.
 */

const DISMISS_AFTER_MS = 6000;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export function Toast({
  message,
  action,
  onDismiss,
  /**
   * Restarts the countdown when it changes. A second removal replaces the first toast rather
   * than queueing behind it - two of these on screen would be a stack to design, and the second
   * message is always the one somebody means to act on.
   */
  resetKey,
}: {
  message: string;
  action?: ToastAction;
  onDismiss: () => void;
  resetKey?: string | number;
}) {
  const [mounted, setMounted] = useState(false);
  const [paused, setPaused] = useState(false);
  const dismiss = useRef(onDismiss);

  dismiss.current = onDismiss;

  // Nothing to portal into until there is a document. Also what keeps this out of the way of a
  // first render that happens before the body exists.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (paused) {
      return;
    }

    const timer = window.setTimeout(() => dismiss.current(), DISMISS_AFTER_MS);

    return () => window.clearTimeout(timer);
    // `resetKey` is here so a replacement message gets the full window rather than whatever was
    // left of the last one's.
  }, [paused, resetKey]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      // `pointer-events-none` on the container and back on for the toast itself, or an invisible
      // strip across the bottom of the page would eat presses on whatever is under it.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
    >
      <AnimatePresence>
        <motion.div
          key={resetKey ?? message}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className={cn(
            "pointer-events-auto flex items-center gap-3 rounded-lg border border-border/70",
            "bg-background px-3.5 py-2.5 shadow-lg"
          )}
        >
          <span className="text-[12px] leading-snug text-foreground">
            {message}
          </span>

          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium text-foreground",
                "underline decoration-border underline-offset-2 transition-colors",
                "hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2"
              )}
            >
              {action.label}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className={cn(
              "-mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground",
              "transition-colors hover:bg-accent hover:text-foreground",
              "focus-visible:outline-2 focus-visible:-outline-offset-2"
            )}
          >
            <svg
              viewBox="0 0 12 12"
              className="size-2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body
  );
}
