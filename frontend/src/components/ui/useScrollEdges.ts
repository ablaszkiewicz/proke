import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Which edges a scrolling column continues past.
 *
 * Drives the two gradient overlays at the top and bottom of a column, which are the part of an
 * inside-itself column that actually says "there is more" - a scrollbar only says it while the
 * pointer is over it, and by then the person has already decided the list is short.
 *
 * Measured rather than assumed, and re-measured on resize and whenever the rows change, because
 * the answer moves for three unrelated reasons: somebody scrolls, the window changes shape, or
 * a refresh adds a pull request to a list that until then fitted.
 */
export function useScrollEdges<T extends HTMLElement>(
  /** Anything whose change can alter the content height. Re-measures when it does. */
  dependency: unknown
) {
  const ref = useRef<T | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  const measure = useCallback(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = element;
    // A pixel of slack: sub-pixel layout means scrollTop rarely lands exactly on the bottom,
    // and a fade that never quite turns off at the end of a list looks like a bug.
    const top = scrollTop > 1;
    const bottom = scrollTop + clientHeight < scrollHeight - 1;

    setEdges((was) =>
      was.top === top && was.bottom === bottom ? was : { top, bottom }
    );
  }, []);

  useEffect(() => {
    measure();
  }, [measure, dependency]);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    // ResizeObserver rather than a window listener: a column's height changes when the window
    // does, and its content height changes when a section is collapsed, which no window event
    // reports.
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    for (const child of Array.from(element.children)) {
      observer.observe(child);
    }

    return () => observer.disconnect();
  }, [measure, dependency]);

  return { ref, onScroll: measure, edges } as const;
}
