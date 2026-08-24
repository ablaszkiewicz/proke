import {
  DEFAULT_RECENT_DRAFT_WINDOW,
  type InboxFilterChange,
  type InboxFilters,
  type RecentDraftWindow,
} from "@/lib/api/inbox.api";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  INBOX_FILTER_OPTIONS,
  switchPosition,
  valueWhenPressed,
  type SwitchOption,
  type WindowOption,
} from "./filters";

/**
 * What the inbox is showing, and the one control on this page that changes it.
 *
 * ## Why it is behind a button
 *
 * Because it is read once and set once. A filter that lived on the page would be a permanent
 * row of controls above a list whose entire argument is that it carries nothing you could answer
 * by opening a pull request - and the page would be paying for it on every one of the twenty
 * loads a day where nobody touches it. Behind a button it costs one small mark in the corner of
 * the header, and it is exactly as reachable.
 *
 * ## Why it is neither a dialog nor a menu
 *
 * Not a dialog, because filters are not a decision to be confirmed. There is no Save, no Cancel
 * and no closing on a press: every toggle takes effect immediately, the rows behind it change
 * under the open panel, and somebody can turn two things on and watch both happen. A dialog
 * would put a scrim over the only thing they are trying to look at.
 *
 * Not `role="menu"` either, though it is drawn like one. A menu is a promise about how it is
 * driven - arrow keys move between items, Tab leaves - and making that promise means keeping it
 * with a roving tabindex and a keydown handler. What is actually in here is a group of switches,
 * so it says so: real buttons, in the tab order, driven by Tab and Space like every other
 * control on the page. The behaviour a screen reader is told to expect is the behaviour it gets.
 *
 * ## What is deliberately absent
 *
 * A count of what is hidden. It reads as a warning - "you have 3 hidden" - about a thing the
 * reader chose, and it would need the server to keep and send a number for rows it was asked not
 * to send. The toggle is either on or it is not, and it says so.
 */
export function InboxSettings({
  filters,
  onChange,
}: {
  filters: InboxFilters;
  /** Applied immediately. There is nothing to confirm. */
  onChange: InboxFilterChange;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Stable, or the effect behind it rebinds its listeners on every render of the page.
  const close = useCallback(() => setOpen(false), []);

  usePanelDismissal({ open, close, triggerRef, panelRef });

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Filters"
        className={cn(
          // The one piece of chrome on the page, so it is sized to be found rather than seen:
          // muted until it is wanted, and lit by the same `accent` a row uses under a pointer.
          "flex size-8 items-center justify-center rounded-lg transition-colors",
          open
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <SlidersIcon className="size-[18px]" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panelRef}
            id={panelId}
            role="group"
            // Named directly rather than by a heading inside it. The heading that used to be
            // here said "Show", which stopped being true the moment a toggle in the list read
            // "Hide" - and a panel holding a couple of switches over one list has nothing to
            // title that its own accessible name does not already say.
            aria-label="Filters"
            // Barely any travel, and from the corner it came out of. Same curve and roughly the
            // same eighth of a second as a modal opening - see index.css - so the two read as
            // one product rather than two ideas about how things should appear.
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            style={{ transformOrigin: "top right" }}
            // Above the fades at the top of each column, which are z-10.
            className={cn(
              // Capped against the viewport as well as sized, or on a narrow phone a panel hung
              // off the right edge of the header runs off the left one.
              "absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-4rem)] origin-top-right",
              "rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
            )}
          >
            {INBOX_FILTER_OPTIONS.map((option) =>
              option.kind === "window" ? (
                <WindowFilter
                  key={option.key}
                  option={option}
                  value={filters[option.key]}
                  onChange={onChange}
                />
              ) : (
                <SwitchFilter
                  key={option.key}
                  option={option}
                  filters={filters}
                  onChange={onChange}
                />
              )
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * A filter that is on or off.
 *
 * Nothing here but the reconciliation between the switch and the filter: an option can be
 * worded the opposite way round from the name that crosses the wire, and `switchPosition` and
 * `valueWhenPressed` are the only two places that is undone. `onChange` is handed the filter's
 * value, never the switch's.
 */
function SwitchFilter({
  option,
  filters,
  onChange,
}: {
  option: SwitchOption;
  filters: InboxFilters;
  onChange: InboxFilterChange;
}) {
  const on = switchPosition(option, filters);

  return (
    <FilterItem
      label={option.label}
      detail={option.detail}
      checked={on}
      onToggle={() => onChange(option.key, valueWhenPressed(option, on))}
    />
  );
}

/**
 * A filter that is on or off and, when on, says how far back it reaches.
 *
 * ## Why the spans are not there when it is off
 *
 * Because there is no such thing as a window when the section is not being drawn. Leaving five
 * dimmed buttons under an off switch would be five controls that either do nothing or turn the
 * thing back on, and both of those are worse than the space they take.
 *
 * The cost is that a window turned off and on again comes back at the default rather than where
 * it was. That is the honest answer rather than a shortcoming: nothing on this page keeps a
 * setting that is not in force, because the address bar is the only place settings are kept and
 * it carries only what is in force. Somebody who wants a different span presses it, which is
 * the same press they made the first time.
 *
 * ## Why the spans are buttons rather than radios
 *
 * Same reason the panel is not a `role="menu"` - see above. `radiogroup` is a promise about how
 * it is driven: arrow keys move within the group, and Tab passes over the whole thing. Keeping
 * that promise means a roving tabindex and a keydown handler, and what is actually here is five
 * buttons. So they say so, and Tab and Space work on them like everything else on the page.
 */
function WindowFilter({
  option,
  value,
  onChange,
}: {
  option: WindowOption;
  value: InboxFilters["recentDrafts"];
  onChange: InboxFilterChange;
}) {
  const on = value !== "off";

  return (
    <div>
      <FilterItem
        label={option.label}
        detail={option.detail}
        checked={on}
        onToggle={() =>
          onChange(option.key, on ? "off" : DEFAULT_RECENT_DRAFT_WINDOW)
        }
      />

      {/*
        `initial={false}` so a panel opened on a filter that is already on does not play the
        spans unrolling. They were there before it opened; only a press should move them.
      */}
      <AnimatePresence initial={false}>
        {on ? (
          <motion.div
            // Height, which is the one animation on this page that is not position or opacity.
            // A row of buttons appearing between a toggle and the edge of a panel has to push
            // something, and the panel growing under its own corner is the whole gesture - see
            // the note on the page about why nothing in the *list* animates its size.
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div
              role="group"
              aria-label={option.choicesLabel}
              className="flex gap-1 px-2.5 pb-2 pt-0.5"
            >
              {option.choices.map((choice) => (
                <WindowChoice
                  key={choice}
                  choice={choice}
                  selected={choice === value}
                  onPick={() => onChange(option.key, choice)}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * One span.
 *
 * `aria-pressed` rather than `aria-checked`, because these are buttons and not radios. The
 * visible word is the short form - five of them share the width of the panel, and "6 hours" put
 * next to "12 hours" next to "7 days" would wrap - so the spoken name is written out instead.
 */
function WindowChoice({
  choice,
  selected,
  onPick,
}: {
  choice: RecentDraftWindow;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Last ${SPOKEN_WINDOWS[choice]}`}
      onClick={onPick}
      className={cn(
        "flex-1 rounded-md py-1 text-center text-[12px] font-medium tabular-nums transition-colors",
        "focus-visible:outline-2 focus-visible:-outline-offset-2",
        selected
          ? "bg-primary text-primary-foreground"
          : // Tinted from `foreground` rather than from `muted`, which on this palette is two
            // points off the panel behind it - the same reason the off switch has a visible
            // track. Lighter than that track, though: five of these in a row at the switch's
            // own weight would be the loudest thing in the panel.
            "bg-foreground/10 text-muted-foreground hover:bg-foreground/20 hover:text-foreground"
      )}
    >
      {choice}
    </button>
  );
}

/** What a screen reader says, where the button itself has room for four characters. */
const SPOKEN_WINDOWS: Record<RecentDraftWindow, string> = {
  "6h": "6 hours",
  "12h": "12 hours",
  "1d": "1 day",
  "3d": "3 days",
  "7d": "7 days",
};

/**
 * One toggle.
 *
 * `role="switch"` on the row itself rather than a checkbox tucked inside it: it is a thing you
 * press that turns something on immediately, which is what a switch means and is not quite what
 * a checkbox means. The whole row is the target - the pill on the right is a poor thing to have
 * to hit, and the label beside it is the part somebody is reading when they decide to press.
 */
function FilterItem({
  label,
  detail,
  checked,
  onToggle,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      // The outline colour comes from the base layer's `outline-ring/50`, so a focused row is
      // ringed in the same warm gold everything else in this app focuses in. `bg-accent` alone
      // was not enough to be a focus state - it is two points off the panel it sits on.
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2"
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-snug text-foreground">
          {label}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
          {detail}
        </span>
      </span>

      <Switch checked={checked} />
    </button>
  );
}

/**
 * The state of a toggle, and never the control itself - the row above is the control, and this
 * carries no role, no tabstop and no handler of its own.
 *
 * The knob moves with `layout` rather than a translate, which is the one way the travel stays
 * right if the track ever changes size, and it inherits the page's `reducedMotion="user"` for
 * free: somebody who asked for less motion gets the knob in its new place with no slide, which
 * still says everything the control needs to say.
 */
function Switch({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-[3px] flex h-[18px] w-8 shrink-0 items-center rounded-full p-[3px] transition-colors duration-200",
        // Off is `foreground/15` rather than `muted`, which on this palette is two points off
        // the panel behind it - a track nobody could see, and a switch that only looks like a
        // switch half the time.
        checked ? "justify-end bg-primary" : "justify-start bg-foreground/15"
      )}
    >
      <motion.span
        layout
        transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
        className={cn(
          "block size-3 rounded-full transition-colors duration-200",
          checked ? "bg-primary-foreground" : "bg-muted-foreground"
        )}
      />
    </span>
  );
}

/**
 * The three ways out of an open panel, and where focus goes on the way.
 *
 * Escape and a press elsewhere are the two everybody tries. The third is Tab past the last
 * switch, which has to close it or the panel is left open behind somebody who has walked off
 * into the rows.
 *
 * Focus returns to the trigger on Escape and only on Escape - a pointer has already put it
 * somewhere its owner chose, and stealing it back is the classic way a popover loses somebody's
 * place.
 *
 * `pointerdown` rather than `click`: a click fires after the press, so a press that begins
 * outside and ends inside would close the panel underneath its own release.
 *
 * Nothing here closes on scroll, which most popovers do. This one is positioned against the
 * header it hangs from: the columns scroll inside themselves and leave the header where it is,
 * and below `xl` the whole page scrolls and takes both with it. The panel is never anywhere but
 * under its own button. Closing on scroll would also have made a filter shut its own panel -
 * removing rows can shorten a column past its scroll position, and the browser reports the
 * correction it makes as a scroll.
 */
function usePanelDismissal({
  open,
  close,
  triggerRef,
  panelRef,
}: {
  open: boolean;
  close: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    // Captured now so the cleanup unbinds from the element it bound to, whatever has happened
    // to the ref by then.
    const panel = panelRef.current;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      // The trigger closes it through its own onClick. Closing here as well would run both and
      // reopen it on the very press that was meant to shut it.
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }

      close();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.stopPropagation();
      close();
      triggerRef.current?.focus();
    };

    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;

      // Null means focus went nowhere, which is what a press on a non-focusable part of the
      // panel looks like. Closing on that would shut the panel every time somebody clicked the
      // gap between two switches.
      if (
        !next ||
        panelRef.current?.contains(next) ||
        triggerRef.current?.contains(next)
      ) {
        return;
      }

      close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    panel?.addEventListener("focusout", onFocusOut);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      panel?.removeEventListener("focusout", onFocusOut);
    };
  }, [open, close, panelRef, triggerRef]);
}

/**
 * Sliders rather than a cog. A cog says "preferences" - a page of them, somewhere else - and
 * what is behind this button is a couple of switches over this list.
 */
function SlidersIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 7h10M18 7h2" />
      <path d="M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" fill="none" />
      <circle cx="10" cy="17" r="2" fill="none" />
    </svg>
  );
}
