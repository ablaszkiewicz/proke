import { cn } from "@/lib/utils";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

export interface ModalProps {
  open: boolean;
  /** Escape, a backdrop click, or the close control. Never called by a confirm/cancel button. */
  onClose: () => void;
  /** Ties the dialog to its heading for screen readers. */
  labelledBy: string;
  describedBy?: string;
  /**
   * What to focus on open. Handled here rather than with React's `autoFocus`, which only fires
   * when the node mounts - a dialog reopened with new content keeps the same buttons mounted,
   * so the second time it opened the focus landed wherever the browser felt like putting it.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}

/**
 * The base every modal in proke is built on.
 *
 * A real `<dialog>` opened with `showModal()`, rather than a div on a z-index. The browser then
 * does the parts that are easy to get wrong and invisible when you do: focus is trapped inside,
 * Escape closes, the rest of the page goes inert to both the pointer and the screen reader, and
 * it renders in the top layer so no stacking context can ever cover it.
 *
 * What is left to us is the part `window.confirm` never gave us - it looks like the product.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  describedBy,
  initialFocusRef,
  className,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }

      // After showModal, which does its own focusing first.
      initialFocusRef?.current?.focus();
      return;
    }

    if (!dialog.open) {
      return;
    }

    // Let the exit animation run before the element leaves the top layer. Waiting on the
    // animations themselves rather than on a timer is what keeps this correct under
    // `prefers-reduced-motion`, where there are none and this resolves immediately - a fixed
    // delay would leave the dialog sitting there, and an `animationend` listener would wait
    // for an event that never fires.
    let cancelled = false;
    const animations = dialog.getAnimations({ subtree: true });

    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled && dialog.open) {
        dialog.close();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, initialFocusRef]);

  // `showModal()` does not stop the page behind from scrolling.
  useEffect(() => {
    if (!open) {
      return;
    }

    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      data-state={open ? "open" : "closed"}
      // Escape fires `cancel`, not a close we control. Taking it over means the exit animation
      // and the caller's cleanup run on Escape exactly as they do on any other dismissal.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click that lands on the dialog element itself landed on the backdrop: everything
      // visible is inside the child below, which stops the event before it reaches here.
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
      // Motion and the backdrop are keyed off data-state in index.css - see the note there for
      // why they cannot be utilities on this element.
      className={cn(
        "m-auto w-[calc(100vw-2rem)] max-w-md bg-transparent p-0 text-foreground",
        className
      )}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="rounded-xl border bg-card p-5 text-left shadow-xl"
      >
        {children}
      </div>
    </dialog>
  );
}
