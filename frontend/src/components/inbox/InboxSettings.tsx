import {
  DEFAULT_RECENT_DRAFT_WINDOW,
  type InboxFilterChange,
  type InboxFilters,
  type InboxTeam,
  type RecentDraftWindow,
} from "@/lib/api/inbox.api";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import {
  INBOX_FILTER_OPTIONS,
  switchPosition,
  valueWhenPressed,
  type AuthorsOption,
  type InboxFilterOption,
  type SwitchOption,
  type TeamsOption,
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
  teams,
  teamsAsked,
  onChange,
}: {
  filters: InboxFilters;
  /**
   * The teams the "your team" heading is built from, for the reader to strike one out.
   *
   * Undefined is "not established yet", which the panel says out loud rather than drawing as an
   * empty list - see the note on TeamsFilter.
   */
  teams?: InboxTeam[];
  /**
   * Whether GitHub has answered for this person at all.
   *
   * Only ever consulted about the teams, and only to separate "not yet" from "would not say" -
   * absent teams after a real answer is a missing permission rather than a slow one.
   */
  teamsAsked: boolean;
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

  /**
   * One setting, drawn as whatever kind it is.
   *
   * A function rather than four branches inline, because the dividers between them are the
   * caller's business and the control itself is this one's - and mixing the two put a `switch`
   * inside a `map` inside JSX, which is three things to read before finding the component.
   */
  const renderFilter = (option: InboxFilterOption) => {
    switch (option.kind) {
      case "window":
        return (
          <WindowFilter
            option={option}
            value={filters[option.key]}
            onChange={onChange}
          />
        );
      case "teams":
        return (
          <TeamsFilter
            option={option}
            on={filters[option.key]}
            excluded={filters[option.membersKey]}
            teams={teams}
            asked={teamsAsked}
            onChange={onChange}
          />
        );
      case "authors":
        return (
          <AuthorsFilter
            option={option}
            authors={filters[option.key]}
            onChange={onChange}
          />
        );
      default:
        return (
          <SwitchFilter option={option} filters={filters} onChange={onChange} />
        );
    }
  };

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
              "absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-4rem)] origin-top-right",
              // Capped and scrolling, because it is no longer a panel of switches: a long team
              // list plus a field of chips can outgrow a laptop viewport, and the page it hangs
              // from is `overflow-hidden` from `xl` up - so anything past the bottom would be
              // clipped by the page rather than reachable.
              "max-h-[min(34rem,calc(100dvh-6rem))] overflow-y-auto overscroll-contain",
              "rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
            )}
          >
            {INBOX_FILTER_OPTIONS.map((option, index) => (
              <Fragment key={option.key}>
                {/*
                  A hairline between settings, and only between them - never above the first or
                  below the last, where it would be a second border inside the panel's own.

                  It is here because the panel stopped being a list of switches: two of these
                  controls open into something underneath them, and without a line it is genuinely
                  unclear whether a row of spans belongs to the setting above it or the one below.
                  At `border/60` it is barely a mark - enough to group, not enough to be a
                  feature, which is the whole argument of the page it hangs from.
                */}
                {index > 0 ? (
                  <div aria-hidden="true" className="mx-2.5 my-1 h-px bg-border/60" />
                ) : null}

                {renderFilter(option)}
              </Fragment>
            ))}
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
function TeamsFilter({
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
 * ## Why chips rather than a comma-separated field
 *
 * Because a name is either in the list or it is not, and a text field makes that a question
 * about punctuation. A chip is committed - it has been accepted, it is on screen, and it has an
 * × - where "dependabot, renov" is a half-typed state that has to mean something and cannot.
 *
 * It also decides when the inbox reloads. Every commit here is one round trip, so a field that
 * fired as you typed would be a request per keystroke; a chip fires once, when you say so.
 *
 * ## What is accepted
 *
 * A login, lowercased, with a leading `@` forgiven - somebody typing a GitHub handle types the
 * `@`, and refusing it teaches nothing. Anything already in the list is a no-op rather than a
 * duplicate, and the field clears either way: pressing Enter twice on the same name should feel
 * like it worked twice, because it did.
 */
function AuthorsFilter({
  option,
  authors,
  onChange,
}: {
  option: AuthorsOption;
  authors: string[];
  onChange: InboxFilterChange;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();

  const commit = () => {
    const login = normalizeLogin(draft);

    setDraft("");

    if (login && !authors.includes(login)) {
      onChange(option.key, [...authors, login]);
    }
  };

  // The panel unmounts when it closes, and React does not fire blur on an element it is
  // removing - so without this, a name typed and then dismissed with a click outside the panel
  // would be dropped on the floor, while the same name typed and dismissed with a click inside
  // it would be kept. Two ways of leaving one field behaving differently is worse than either.
  //
  // Through a ref because the cleanup runs once, holding whichever closure it was created with,
  // and the draft it needs to commit is the last one rather than the first.
  const pending = useRef(commit);
  pending.current = commit;
  useEffect(() => () => pending.current(), []);

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

      {authors.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {authors.map((login) => (
            <AuthorChip
              key={login}
              login={login}
              onRemove={() =>
                onChange(
                  option.key,
                  authors.filter((kept) => kept !== login)
                )
              }
            />
          ))}
        </div>
      ) : null}

      <input
        id={inputId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Comma as well as Enter, because somebody pasting a list types the separator they
          // would have used in a text field - and the address bar this ends up in uses it too.
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();

            return;
          }

          // Backspace on an empty field takes the last chip, which is what every field of chips
          // anywhere does and the only way to correct a mistake without reaching for the mouse.
          if (event.key === "Backspace" && !draft && authors.length > 0) {
            onChange(option.key, authors.slice(0, -1));
          }
        }}
        // Committed on the way out, like every field of chips anywhere: a name typed and then
        // left is a name somebody meant. See the unmount above for the other way out.
        onBlur={commit}
        placeholder={option.placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className={cn(
          "mt-2 w-full rounded-lg bg-foreground/[0.06] px-2 py-1.5 text-[13px] text-foreground",
          "placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-2"
        )}
      />
    </div>
  );
}

/** One committed login. The × is the control; the word beside it is not. */
function AuthorChip({
  login,
  onRemove,
}: {
  login: string;
  onRemove: () => void;
}) {
  return (
    <span className="flex items-center gap-1 rounded-md bg-foreground/10 py-0.5 pl-1.5 pr-1 text-[12px] text-foreground">
      <span className="max-w-[10rem] truncate">{login}</span>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Stop ignoring ${login}`}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors",
          "hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2"
        )}
      >
        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      </button>
    </span>
  );
}

/**
 * The one spelling that reaches the wire.
 *
 * Lowercased because GitHub logins differ only in case and the reader typed theirs by hand; the
 * `@` forgiven because a handle is written with one everywhere else. Matched the same way on the
 * server - see normalizeFilterList - so the chip on screen and the rows removed agree.
 */
function normalizeLogin(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
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
