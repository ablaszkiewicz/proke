import {
  NOTIFICATION_TYPES,
  Octicon,
  POKE_GROUPS,
  type NotificationTypeDescriptor,
  type PokeGroup,
} from "@/components/notifications/notificationTypes";
import { PokeReel } from "@/components/notifications/PokeReel";
import type { NotificationType } from "@/lib/api/connections.api";
import { cn } from "@/lib/utils";
import { useState } from "react";

const CHECK =
  "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z";

export interface PokesPanelProps {
  /** The kinds switched off, account-wide. Empty is the common answer and the default. */
  mutedTypes: NotificationType[];
  onToggleType: (type: NotificationType) => void;
  /** A whole group at once, from its header. */
  onToggleGroup: (types: NotificationType[], muted: boolean) => void;
  /** A refused save, in words. Optional so the drafts gallery renders the panel without one. */
  notice?: string | null;
}

/**
 * What a poke can be about, and the nine switches that decide which of them reach you.
 *
 * ## Account-wide, which is the whole point
 *
 * These are not per-organisation. Somebody who does not want to hear about merges does not want
 * to hear about them anywhere, and asking that question once per org would be asking it four
 * times for one answer. An organisation can still narrow further - that is what a subscription
 * is - but nothing can widen past what is set here.
 *
 * ## Why a flat list under headings rather than collapsible groups
 *
 * Because the window underneath is the point. Every row is a hover target that scrolls the reel
 * to the poke that row produces, so you can see what you are switching off before you switch it
 * off - and a group that folds away takes its rows, and that answer, with it. The headings are
 * dividers with a control on them, not sections that open.
 *
 * ## Why the switches move before the server answers
 *
 * Because a switch that waits for a round trip is a switch people press twice. The write is short
 * and nearly always succeeds; where it does not, the panel goes back to what was stored and says
 * so on the line under the list. See pokeSettingsLogic.
 */
export function PokesPanel({
  mutedTypes,
  onToggleType,
  onToggleGroup,
  notice,
}: PokesPanelProps) {
  // The row the reel is showing. Follows the pointer, and stays where it was left afterwards -
  // the last thing looked at is the most useful thing to still be looking at.
  const [activeIndex, setActiveIndex] = useState(0);

  const on = NOTIFICATION_TYPES.length - mutedTypes.length;
  const everything = mutedTypes.length === 0;
  const nothing = on === 0;

  return (
    <section className="flex flex-col rounded-xl border p-5">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">What prokes you</h2>
        {/*
          Keyed on the wording rather than the count, so arriving at "every kind" fades in once
          and a count that then changes swaps quietly instead of the line flickering per digit.
        */}
        <span
          key={everything ? "all" : "some"}
          className="animate-fade-in text-xs text-muted-foreground"
        >
          {everything ? "Every kind" : `${on} of ${NOTIFICATION_TYPES.length} kinds`}
        </span>
      </header>

      {/*
        A list per group rather than one list with headings inside it, so a heading is never a
        list item. The reel is handed the row's position in NOTIFICATION_TYPES, which is kept
        grouped and in group order - so that index is also where the row sits on screen, and the
        reel scrolls the way the eye just moved.
      */}
      <div className="-mx-2">
        {POKE_GROUPS.map((group, groupIndex) => (
          <section key={group.key}>
            <GroupHeader
              group={group}
              mutedTypes={mutedTypes}
              onToggleGroup={onToggleGroup}
              first={groupIndex === 0}
            />

            <ul>
              {NOTIFICATION_TYPES.filter(
                (descriptor) => descriptor.group === group.key
              ).map((descriptor) => {
                const index = NOTIFICATION_TYPES.indexOf(descriptor);

                return (
                  <li key={descriptor.type}>
                    <TypeRow
                      descriptor={descriptor}
                      muted={mutedTypes.includes(descriptor.type)}
                      active={index === activeIndex}
                      onShow={() => setActiveIndex(index)}
                      onToggle={() => onToggleType(descriptor.type)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/*
        The poke itself, as Slack will show it. The window's own top fade is the gap above it,
        so it needs no margin of its own - and no label, because a Slack message that says who
        did what is not a thing anybody needs told what it is.
      */}
      <PokeReel index={activeIndex} className="mt-4" />

      {/*
        The line under the list, and only ever one thing at a time: a refused save while there is
        one, then the state worth warning about, then nothing. Muting everything is a choice
        somebody is allowed to make, so it is said plainly rather than argued with.
      */}
      <p
        className={cn(
          "mt-auto pt-4 text-[10px] leading-relaxed",
          notice ? "text-destructive" : "text-muted-foreground/60"
        )}
      >
        {notice ??
          (nothing
            ? "Nothing will proke you. Turn a kind back on and it starts again."
            : "Every organisation you listen to, every repo it covers. Choosing repos comes later.")}
      </p>
    </section>
  );
}

/**
 * A group's name, how much of it is on, and the one control that moves all of it.
 *
 * The control is the count itself rather than a switch beside it: it is already the thing that
 * says what the group is doing, and a second element on a line this quiet would be louder than
 * anything under it. Pressing it turns the group off unless it already is, which is the only
 * unambiguous reading of one press on a mixed group.
 */
function GroupHeader({
  group,
  mutedTypes,
  onToggleGroup,
  first,
}: {
  group: PokeGroup;
  mutedTypes: NotificationType[];
  onToggleGroup: (types: NotificationType[], muted: boolean) => void;
  first: boolean;
}) {
  const types = NOTIFICATION_TYPES.filter(
    (descriptor) => descriptor.group === group.key
  ).map((descriptor) => descriptor.type);
  const on = types.filter((type) => !mutedTypes.includes(type)).length;
  const allOff = on === 0;

  return (
    <div
      className={cn(
        "group/header flex items-baseline justify-between px-2 pb-1",
        first ? "pt-1" : "pt-3"
      )}
    >
      <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {group.title}
      </h3>

      {/*
        Dimmed until the pointer is on the group, because on an untouched account every one of
        these reads "4 on" and three of them shouting it is three more things to read than the
        list needs.
      */}
      <button
        type="button"
        onClick={() => onToggleGroup(types, !allOff)}
        // "3 on" is the state, not the action. Read on its own it says nothing about what
        // pressing it does, so the label says that and the count stays as the thing to look at.
        aria-label={
          allOff
            ? `Turn every ${group.title.toLowerCase()} poke back on`
            : `Turn off all ${on} ${group.title.toLowerCase()} pokes`
        }
        className="cursor-pointer rounded text-[10px] text-muted-foreground/50 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none group-hover/header:text-muted-foreground"
      >
        {allOff ? "all off" : `${on} on`}
      </button>
    </div>
  );
}

/** One kind: what it is, whether it reaches you, and - on hover - what it looks like in Slack. */
function TypeRow({
  descriptor,
  muted,
  active,
  onShow,
  onToggle,
}: {
  descriptor: NotificationTypeDescriptor;
  muted: boolean;
  active: boolean;
  onShow: () => void;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!muted}
      onMouseEnter={onShow}
      onFocus={onShow}
      onClick={() => {
        // Showing this row's poke as well as flipping it: a press with the keyboard has not
        // hovered anything, and the reel is the explanation of what was just switched off.
        onShow();
        onToggle();
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
        active ? "bg-accent" : "hover:bg-accent/50"
      )}
    >
      <Octicon
        path={descriptor.icon}
        className={cn(
          "shrink-0 transition-colors",
          muted
            ? "text-muted-foreground/40"
            : active
              ? "text-foreground"
              : "text-muted-foreground"
        )}
      />
      {/*
        The title dims rather than striking through. A struck row reads as deleted, and this one
        is merely off - it is still a thing that exists and can come back with one press.
      */}
      <span
        className={cn(
          "flex-1 transition-colors",
          muted ? "text-muted-foreground/50" : undefined
        )}
      >
        {descriptor.title}
      </span>

      {/*
        The tick is the switch. An empty ring in its place keeps the row exactly as wide when it
        is off, so a column of them does not shuffle as they are pressed.
      */}
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {muted ? (
          <span
            aria-hidden="true"
            className="size-3 rounded-full border border-muted-foreground/30"
          />
        ) : (
          <Octicon path={CHECK} size={12} className="text-emerald-500/80" />
        )}
      </span>
    </button>
  );
}
