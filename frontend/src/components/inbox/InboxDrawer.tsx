import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

/**
 * The panel that takes width from the inbox, and everything that is true of it whatever is
 * inside.
 *
 * ## Why the shell is separate from its contents
 *
 * Because there are two panels now - the filters, and the views being kept ready - and they are
 * one drawer rather than two. Everything below is the fiddly half: squish-versus-cover at the
 * breakpoint, a scrim that must appear in one of those cases and not the other, `inert` so a
 * shut drawer is not in the tab order, and a first paint that does not slide. A second copy of
 * that would not stay a copy.
 *
 * One aside also settles what happens when somebody opens the second panel while the first is
 * open: the contents swap and the drawer stays where it is. Two asides would have had to slide
 * one shut and the other open, which reads as two things happening when one did.
 *
 * ## Why the page squishes
 *
 * Nothing had to be told how to. The content is centred inside a maximum width, so taking width
 * from its container re-centres it in what is left - the two columns simply get narrower, and
 * with the drawer shut the page is exactly what it was before this existed.
 *
 * That only works while there is width to take. Below `xl` the columns are already stacked and a
 * phone has none to give, so there the drawer stops squishing and covers instead, over a scrim.
 * Which is the popover problem again - but on a screen showing one column at a time it was never
 * possible to show both, and pretending otherwise would leave 46 pixels of inbox.
 */

/**
 * Fixed, and the panel inside is fixed to the same number.
 *
 * Animating a width would otherwise reflow everything inside it on every frame - text rewrapping
 * mid-slide, which reads as the drawer being assembled rather than revealed. This way the panel
 * is laid out once at full size and the aside simply stops clipping it.
 */
const DRAWER_WIDTH = 344;

const TRANSITION = { duration: 0.34, ease: [0.2, 0.7, 0.2, 1] as const };

export function InboxDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Kept mounted while the drawer animates shut, which is why the page holds on to which panel
   * was last shown rather than clearing it. Unmounting on close would empty the drawer a frame
   * before it finished closing.
   */
  children: ReactNode;
}) {
  const squishes = useSquishes();

  useEscapeToClose(open, onClose);

  return (
    <>
      {/*
        Only where the drawer covers rather than squishes. A scrim over a page the drawer has
        made room for would be dimming the very thing somebody opened it to watch.
      */}
      <AnimatePresence>
        {open && !squishes ? (
          <motion.div
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 bg-background/70"
          />
        ) : null}
      </AnimatePresence>

      <motion.aside
        // `initial={false}`, or the drawer plays itself shut on every first paint of the page.
        initial={false}
        animate={
          squishes
            ? { width: open ? DRAWER_WIDTH : 0, x: 0 }
            : { width: DRAWER_WIDTH, x: open ? 0 : DRAWER_WIDTH }
        }
        transition={TRANSITION}
        className={cn(
          "z-40 shrink-0 overflow-hidden border-l border-border/70 bg-background text-foreground",
          squishes ? "relative h-full" : "fixed inset-y-0 right-0 shadow-2xl"
        )}
      >
        <div
          style={{ width: DRAWER_WIDTH }}
          className="flex h-full flex-col"
          // Hidden from everything, not just from sight, when it is shut - or Tab walks into a
          // panel nobody can see and the page scrolls sideways chasing the focus ring.
          inert={!open}
        >
          {children}
        </div>
      </motion.aside>
    </>
  );
}

/**
 * What the panel is, and a way out.
 *
 * `note` is optional because only one of the two panels has something nobody would guess about
 * it. Where there is one it is not a disclaimer - it is a fact the reader is owed before they
 * find it out the hard way, carrying the thing to do about it.
 *
 * `pt-9` rather than the page header's `pt-8`, because the heading beside it sits on a baseline
 * rather than on the top of its box.
 */
export function DrawerHeader({
  title,
  note,
  onClose,
}: {
  title: string;
  note?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-border/70 px-4 pb-3 pt-9">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-medium tracking-tight text-foreground">
          {title}
        </h2>

        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
          className={cn(
            "ml-auto flex size-6 items-center justify-center rounded text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2"
          )}
        >
          <svg
            viewBox="0 0 12 12"
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      </div>

      {note ? (
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** The same breakpoint the two columns appear at, which is not a coincidence: squishing is worth
 *  doing exactly when there are two columns to squish. */
const WIDE = "(min-width: 80rem)";

/**
 * Whether there is width to take, which is the whole difference between the drawer's two
 * behaviours.
 *
 * A media query rather than a resize listener with a comparison in it: the browser already knows
 * when this changes and will say so.
 *
 * ## Why it is read during the first render rather than in the effect
 *
 * Because it used to be read in the effect, and the page slid sideways every time anybody opened
 * it. The first render believed it was the narrow kind, so the drawer was drawn as an overlay
 * 344 pixels wide; the effect then corrected it to the in-flow kind at zero width, and motion
 * did what it is for and animated the difference. What that looks like is the whole inbox
 * starting a quarter-page to the left and sliding right into place - an entrance nobody asked
 * for, on a page whose entire argument is that nothing may delay somebody seeing their data.
 *
 * Read here, the first paint already knows, `initial={false}` has nothing to animate from, and
 * the drawer is simply shut. A real change of breakpoint still animates, which is correct: that
 * one is a thing that happened rather than a thing we had not got round to asking.
 */
function useSquishes(): boolean {
  const [squishes, setSquishes] = useState(matchesWide);

  useEffect(() => {
    const query = window.matchMedia(WIDE);

    // In case the window changed between that first render and this. Same value is a no-op, so
    // the common path costs nothing and does not re-render.
    setSquishes(query.matches);

    const onChange = (event: MediaQueryListEvent) => setSquishes(event.matches);

    query.addEventListener("change", onChange);

    return () => query.removeEventListener("change", onChange);
  }, []);

  return squishes;
}

/** False where there is no window to ask, which is a render outside a browser and nothing else. */
function matchesWide(): boolean {
  return typeof window !== "undefined" && window.matchMedia(WIDE).matches;
}

/**
 * Escape closes it, and that is the only dismissal it has.
 *
 * A press on the page does not, unlike the popover this replaced - and the difference is the
 * point. The page is not a way out of a drawer that made room for it; it is the thing the drawer
 * is about, and clicking a pull request while reading the settings should open the pull request.
 * Where the drawer covers instead, the scrim is the press-to-dismiss.
 *
 * Focus is not sent anywhere on the way out. The trigger is still in the header where it was,
 * and stealing focus back to it would move somebody who had already put it somewhere else.
 */
function useEscapeToClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
}
