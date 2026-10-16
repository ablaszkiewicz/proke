import {
  DEFAULT_RECENT_DRAFT_WINDOW,
  type InboxFilterChange,
  type InboxFilters,
  type InboxTeam,
  type RecentDraftWindow,
} from "@/lib/api/inbox.api";
import { LoginsInput } from "@/components/ui/LoginsInput";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import {
  switchPosition,
  valueWhenPressed,
  type AuthorsOption,
  type SwitchOption,
  type TeamsOption,
  type WindowOption,
} from "./filters";

/**
 * The controls one setting can be drawn as, and nothing about where they are drawn.
 *
 * Lifted out of InboxSettings when the same five controls were wanted in two places at once - a
 * popover hanging off the header, and a drawer that squishes the page - and the alternative was
 * two copies of a switch that inverts its own label. Whatever chrome ends up winning, there is
 * one implementation of what is inside it.
 *
 * So: no positioning, no dismissal, no opening or closing. Each of these is a self-contained
 * block that takes the filters and hands back a change, and the thing rendering them decides
 * what sits between them and around them.
 */

/**
 * A filter that is on or off.
 *
 * Nothing here but the reconciliation between the switch and the filter: an option can be
 * worded the opposite way round from the name that crosses the wire, and `switchPosition` and
 * `valueWhenPressed` are the only two places that is undone. `onChange` is handed the filter's
 * value, never the switch's.
 */
export function SwitchFilter({
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
 * setting that is not in force - what is saved is the settings as they stand, and a window that
 * is off has no span. Somebody who wants a different span presses it, which is the same press
 * they made the first time.
 *
 * ## Why the spans are buttons rather than radios
 *
 * Same reason the panel is not a `role="menu"` - see above. `radiogroup` is a promise about how
 * it is driven: arrow keys move within the group, and Tab passes over the whole thing. Keeping
 * that promise means a roving tabindex and a keydown handler, and what is actually here is five
 * buttons. So they say so, and Tab and Space work on them like everything else on the page.
 */
export function WindowFilter({
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

      <Reveal show={on}>
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
      </Reveal>
    </div>
  );
}

/**
 * The "your team" heading, and the teams it is built from.
 *
 * ## Why the list is here at all
 *
 * Because "your team" is the one heading on the page whose rule is invisible, and the person it
 * gets wrong is exactly the person who cannot see why. Somebody in a company-wide GitHub team
 * has a "your team" that means "everybody" and an "everyone else" that is empty, and nothing
 * anywhere says so. Showing the teams turns that from a bug report into a checkbox.
 *
 * ## Ticked means counts
 *
 * The filter behind this is `excludedTeams` - a list of what does *not* count - and the boxes
 * read the other way round, which is the same inversion the approved switch makes and for the
 * same reason. A list of what to keep would have to be complete the day it was written, so a
 * team joined next month would silently not count; a list of what to remove has no such problem.
 * The reader should not have to hold that: they see their teams, and they untick one.
 *
 * ## Four states, not two
 *
 * A list, and three ways of having none. Absent teams before GitHub has answered anything is
 * "not yet"; absent teams *after* it has answered the rest of the inbox is "it would not say",
 * which is a missing organisation permission far more often than an outage and is the only one
 * of the three anybody can act on; an empty array is "you are in none". All three draw as the
 * same nothing and mean different things, so all three say which they are.
 *
 * The middle one is worked out here rather than sent, because the server cannot tell them apart
 * without a second field: a cold read has not asked, and a 403 asked and was refused, and both
 * leave it with no teams to send. What separates them from here is whether the *inbox* came
 * back - if it did, GitHub was reached, and the teams are missing for a reason.
 */
export function TeamsFilter({
  option,
  on,
  excluded,
  teams,
  asked,
  onChange,
}: {
  option: TeamsOption;
  on: boolean;
  excluded: string[];
  teams?: InboxTeam[];
  asked: boolean;
  onChange: InboxFilterChange;
}) {
  return (
    <div>
      <FilterItem
        label={option.label}
        detail={option.detail}
        checked={on}
        onToggle={() => onChange(option.key, !on)}
      />

      <Reveal show={on}>
        {teams === undefined ? (
          <Note>{asked ? option.unavailable : option.waiting}</Note>
        ) : teams.length === 0 ? (
          <Note>{option.none}</Note>
        ) : (
          <div role="group" aria-label={option.label} className="px-1 pb-1.5">
            {teams.map((team) => (
              <TeamRow
                key={team.key}
                team={team}
                counts={!excluded.includes(team.key)}
                onToggle={() =>
                  onChange(
                    option.membersKey,
                    excluded.includes(team.key)
                      ? excluded.filter((key) => key !== team.key)
                      : [...excluded, team.key]
                  )
                }
              />
            ))}
          </div>
        )}
      </Reveal>
    </div>
  );
}

/**
 * One team.
 *
 * `role="checkbox"` rather than the switch used above it, because these are not settings that
 * turn something on - they are members of a set, and a column of switches would read as five
 * independent features. The organisation is beside the name rather than under it: two teams
 * called "Core" in different organisations is the ordinary case, and the name alone would be
 * two identical rows.
 */
function TeamRow({
  team,
  counts,
  onToggle,
}: {
  team: InboxTeam;
  counts: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={counts}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors",
        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2"
      )}
    >
      <Tick checked={counts} />

      <span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-foreground">
        {team.name}
        <span className="ml-1.5 text-[12px] text-muted-foreground">{team.org}</span>
      </span>
    </button>
  );
}

/** The state of a checkbox, and never the control - the row above is the control. */
function Tick({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-[15px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked
          ? "border-primary bg-primary text-primary-foreground"
          : "border-foreground/25"
      )}
    >
      {checked ? (
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.2 4.8 8.5 9.5 3.8" />
        </svg>
      ) : null}
    </span>
  );
}

/**
 * The logins whose pull requests never arrive.
 *
 * Chips rather than a comma-separated field, committed one at a time - see LoginsInput, which is
 * this field's own behaviour lifted out for the dashboard to use too. Every commit is one round
 * trip, and so one reload of the inbox.
 */
export function AuthorsFilter({
  option,
  authors,
  onChange,
}: {
  option: AuthorsOption;
  authors: string[];
  onChange: InboxFilterChange;
}) {
  const inputId = useId();

  return (
    <div className="px-2.5 py-2">
      <label htmlFor={inputId} className="block cursor-default">
        <span className="block text-[13px] font-medium leading-snug text-foreground">
          {option.label}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
          {option.detail}
        </span>
      </label>

      <LoginsInput
        id={inputId}
        logins={authors}
        onChange={(logins) => onChange(option.key, logins)}
        placeholder={option.placeholder}
        removeLabel={(login) => `Stop ignoring ${login}`}
      />
    </div>
  );
}

/**
 * What a control says instead of a list, when there is no list to show.
 *
 * A sentence rather than an empty box, because an empty box is indistinguishable from a broken
 * one - and both of the things this says are things the reader can act on.
 */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-2 pt-0.5 text-[12px] leading-snug text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * The part of a control that is only there while its switch is on.
 *
 * Shared by the two that have one, so the spans under "Recent drafts" and the teams under "Your
 * team" open at the same speed and in the same way - two controls in one panel behaving
 * differently would read as one of them being broken.
 *
 * `initial={false}` so a panel opened on a filter that is already on does not play its contents
 * unrolling. They were there before it opened; only a press should move them.
 */
function Reveal({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          // Height, which is the one animation on this page that is not position or opacity.
          // Something appearing between a toggle and the edge of a panel has to push something,
          // and the panel growing under its own corner is the whole gesture - see the note on
          // the page about why nothing in the *list* animates its size.
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
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
 * Sliders rather than a cog. A cog says "preferences" - a page of them, somewhere else - and
 * what is behind this button is a couple of switches over this list.
 */
export function SlidersIcon({ className }: { className?: string }) {
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
