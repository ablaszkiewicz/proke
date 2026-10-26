import {
  NOTIFICATION_TYPES,
  Octicon,
  POKE_GROUPS,
  POKE_ROWS,
  type NotificationTypeDescriptor,
  type PokeGroup,
  type PokeRow,
} from "@/components/notifications/notificationTypes";
import { PokeReel } from "@/components/notifications/PokeReel";
import { Button } from "@/components/ui/button";
import { LoginsInput, normalizeLogin } from "@/components/ui/LoginsInput";
import { Modal } from "@/components/ui/Modal";
import { ScrollFade } from "@/components/ui/ScrollFade";
import { Select, type SelectOption } from "@/components/ui/Select";
import { useScrollEdges } from "@/components/ui/useScrollEdges";
import type { NotificationType } from "@/lib/api/connections.api";
import type { BotMode, ReviewRequestResolution } from "@/lib/api/user.api";
import { cn } from "@/lib/utils";
import { useId, useRef, useState, type RefObject } from "react";

const CHECK =
  "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z";

export interface PokesPanelProps {
  /** The kinds switched off, account-wide. Empty is the common answer and the default. */
  mutedTypes: NotificationType[];
  onToggleType: (type: NotificationType) => void;
  /** When a review request is struck through once somebody else reviews. */
  reviewRequestResolution: ReviewRequestResolution;
  onSetReviewRequestResolution: (resolution: ReviewRequestResolution) => void;
  /** Which bots can proke you: every one, or none. */
  botMode: BotMode;
  onSetBotMode: (mode: BotMode) => void;
  /** The exceptions to "no bots", let through. */
  allowedBots: string[];
  onSetAllowedBots: (logins: string[]) => void;
  /** The exceptions to "all bots", kept out. */
  blockedBots: string[];
  onSetBlockedBots: (logins: string[]) => void;
  /** Whether the daily list of what is still waiting arrives, and at what hour. */
  digestEnabled: boolean;
  digestHour: number;
  onSetDigestEnabled: (enabled: boolean) => void;
  onSetDigestHour: (hour: number) => void;
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
 *
 * ## The one row that is not a kind
 *
 * Under the review request sits a row about the same poke: whether it is crossed out at the
 * first review from anybody, or kept until GitHub stops asking you. It is drawn like the nine
 * around it, with a select where they have a tick, because what it asks has two answers rather
 * than yes or no. It is not counted in the header, because it is not a kind - it changes what
 * happens to a poke after it has arrived, not whether it arrives - and its card in the reel is
 * that poke a little later, struck through. It goes quiet when the request itself is off:
 * there is nothing to cross out.
 *
 * ## Bots, under the reel
 *
 * One row beside the digest, and for the digest's reason: it is not a kind, so it has no card
 * for the window and no place in the count. It says which of two answers you have picked -
 * every bot, or none - and how many exceptions you have made to it, and opens a dialog to change
 * either. The exceptions live in the dialog rather than on the panel: most people never need
 * one, and the ones who do are the ones who went looking.
 */
export function PokesPanel({
  mutedTypes,
  onToggleType,
  reviewRequestResolution,
  onSetReviewRequestResolution,
  botMode,
  onSetBotMode,
  allowedBots,
  onSetAllowedBots,
  blockedBots,
  onSetBlockedBots,
  digestEnabled,
  digestHour,
  onSetDigestEnabled,
  onSetDigestHour,
  notice,
}: PokesPanelProps) {
  // The row the reel is showing. Follows the pointer, and stays where it was left afterwards -
  // the last thing looked at is the most useful thing to still be looking at.
  const [activeIndex, setActiveIndex] = useState(0);

  const on = NOTIFICATION_TYPES.length - mutedTypes.length;
  const everything = mutedTypes.length === 0;
  const nothing = on === 0;

  // Whether the list continues past its top or bottom edge, for the fades. Re-measured when the
  // digest's hour row comes and goes underneath, which is the one thing here that changes how
  // much room the list has without the window moving.
  const { ref, onScroll, edges } = useScrollEdges<HTMLDivElement>(digestEnabled);

  return (
    // From `md` up the card may be no taller than the window less the rest of the page - the
    // page says how much that is, see `--dashboard-chrome` in DashboardPage - and the list
    // below is the part that gives when it is not enough. The fallback is no ceiling at all, for
    // anywhere the page has not set one.
    <section className="flex flex-col rounded-xl border p-5 md:max-h-[calc(100dvh-var(--dashboard-chrome,0px))]">
      <header className="mb-2 flex shrink-0 items-baseline justify-between">
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
        list item. The reel is handed the row's position in POKE_ROWS, which is kept grouped and
        in group order - so that index is also where the row sits on screen, and the reel
        scrolls the way the eye just moved.

        ## The list scrolls; nothing else does

        On a window too short for the whole card the list gives way: it scrolls inside itself,
        with a fade at whichever edge it continues past, while the header above and the preview
        and digest below stay put. The preview is the explanation of the switches, and an
        explanation that scrolls away with them explains nothing. `min-h-0` on both boxes is
        what lets them shrink at all.

        The scrolling box is the `-mx-2` wrapper the rows always sat in, so a row's highlight
        still runs into the card's padding and its words still start at the content edge. It
        reaches 11px further right, for the scrollbar's gutter, which `scroll-area` always
        reserves: put there, in the card's padding, the ticks end exactly under the header's count.

        The scrollbar stays up rather than waiting for the pointer, unlike the inbox's. A slot
        of five settings rows reads as the whole list, and the fade alone was too quiet a hint
        that there are four more; the bar says so before anything is touched.
      */}
      <div className="relative flex min-h-0 flex-col">
        <ScrollFade edge="top" show={edges.top} />
        <ScrollFade edge="bottom" show={edges.bottom} />

        <div
          ref={ref}
          onScroll={onScroll}
          data-scrollbar="shown"
          className="scroll-area -ml-2 -mr-[19px] min-h-0"
        >
          {POKE_GROUPS.map((group, groupIndex) => (
            <section key={group.key}>
              <GroupHeader group={group} first={groupIndex === 0} />

              <ul>
                {POKE_ROWS.filter((row) => row.group === group.key).map((row) => {
                  const index = POKE_ROWS.indexOf(row);
                  const active = index === activeIndex;
                  const onShow = () => setActiveIndex(index);

                  if (row.kind === "resolution") {
                    return (
                      <li key="review_request_resolution">
                        <ResolutionRow
                          row={row}
                          resolution={reviewRequestResolution}
                          // Nothing to cross out while the request itself is switched off.
                          disabled={mutedTypes.includes("review_requested")}
                          active={active}
                          onShow={onShow}
                          onChange={onSetReviewRequestResolution}
                        />
                      </li>
                    );
                  }

                  return (
                    <li key={row.descriptor.type}>
                      <TypeRow
                        descriptor={row.descriptor}
                        muted={mutedTypes.includes(row.descriptor.type)}
                        active={active}
                        onShow={onShow}
                        onToggle={() => onToggleType(row.descriptor.type)}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {/*
        The poke itself, as Slack will show it. The window's own top fade is the gap above it,
        so it needs no margin of its own - and no label, because a Slack message that says who
        did what is not a thing anybody needs told what it is.
      */}
      <PokeReel index={activeIndex} className="mt-4 shrink-0" />

      {/*
        The two settings that are not kinds, under one rule: what bots may do, and the digest.
        Neither has a card to show or a place in the count, so they sit below the window rather
        than in the list it explains.
      */}
      <div className="mt-4 shrink-0 border-t pt-3">
        <div className="-mx-2">
          <BotsRow
            mode={botMode}
            allowed={allowedBots}
            blocked={blockedBots}
            onSetMode={onSetBotMode}
            onSetAllowed={onSetAllowedBots}
            onSetBlocked={onSetBlockedBots}
          />
          <DigestRow
            enabled={digestEnabled}
            hour={digestHour}
            onSetEnabled={onSetDigestEnabled}
            onSetHour={onSetDigestHour}
          />
        </div>
      </div>

      {/*
        Nothing under the list unless something has actually happened - a refused save, or every
        kind switched off. There is no standing footnote: the rows say what they do, and a line
        of explanation that is true on every visit is a line nobody reads by the second one.

        Muting everything is a choice somebody is allowed to make, so it is said plainly rather
        than argued with.
      */}
      {notice || nothing ? (
        <p
          className={cn(
            "mt-auto shrink-0 pt-4 text-[10px] leading-relaxed",
            notice ? "text-destructive" : "text-muted-foreground/60"
          )}
        >
          {notice ?? "Nothing will proke you. Turn a kind back on and it starts again."}
        </p>
      ) : null}
    </section>
  );
}

/**
 * A group's name, and nothing else.
 *
 * A per-group count lived here and was the control that muted the whole group. It went because
 * of what it did to the list at rest: three headings each reading "4 on" is the same fact
 * three times, next to nine rows that already show it one tick at a time, and the count in the
 * panel's own header answers it for the whole list anyway. What is left is a divider with a
 * word on it, which is all the grouping needs to do.
 */
function GroupHeader({ group, first }: { group: PokeGroup; first: boolean }) {
  return (
    <h3
      className={cn(
        "px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground",
        first ? "pt-1" : "pt-3"
      )}
    >
      {group.title}
    </h3>
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
      <Tick on={!muted} />
    </button>
  );
}

/**
 * The two answers to "when is a review request crossed out", in the panel's words.
 *
 * The values are the wire's and the names are not: `any_review` is what the server stores, and
 * "Default" is what it is to the person choosing - the answer nearly every team wants, and the
 * one an untouched account already has. Each carries the line that makes it mean something,
 * because "Strict" on its own is a word, not a setting.
 */
const REVIEW_REQUEST_RESOLUTIONS: readonly SelectOption<ReviewRequestResolution>[] = [
  {
    value: "any_review",
    title: "Default",
    detail: "The first review from anybody crosses it out.",
  },
  {
    value: "strict",
    title: "Strict",
    detail: "Stays until you review, or GitHub stops asking you.",
  },
];

/**
 * The row that is a setting rather than a kind: when a review request poke is crossed out.
 *
 * Drawn like the rows around it - icon, title, the reel following the pointer - with a select
 * where they have a tick. A select rather than the switch this replaced, because the switch had
 * one line to describe its on state - "keep it until your review is no longer needed" - and
 * that line was doing two jobs badly: naming a mode and explaining it. The select names the
 * mode on the row and explains both where they are chosen, each in a sentence of its own.
 *
 * The whole row opens the list, the way the whole of every other row is its switch. Quiet while
 * the request itself is off: there is nothing to cross out. It still lights and shows its card
 * under the pointer, though - the card is the explanation of what the setting would do.
 */
function ResolutionRow({
  row,
  resolution,
  disabled,
  active,
  onShow,
  onChange,
}: {
  row: Extract<PokeRow, { kind: "resolution" }>;
  resolution: ReviewRequestResolution;
  disabled: boolean;
  active: boolean;
  onShow: () => void;
  onChange: (resolution: ReviewRequestResolution) => void;
}) {
  return (
    // onFocus bubbles in React, so focus landing on the trigger or on an option in the open
    // list both keep the reel on this row. On a wrapper rather than the trigger because a
    // disabled button fires no mouse events of its own, and the card should still show.
    <div onMouseEnter={onShow} onFocus={onShow}>
      <Select
        label={row.title}
        options={REVIEW_REQUEST_RESOLUTIONS}
        value={resolution}
        onChange={onChange}
        disabled={disabled}
        className={cn(
          "px-2 py-1.5 text-sm",
          active ? "bg-accent" : disabled ? undefined : "hover:bg-accent/50"
        )}
      >
        <Octicon
          path={row.icon}
          className={cn(
            "shrink-0 transition-colors",
            active ? "text-foreground" : "text-muted-foreground"
          )}
        />
        <span className="flex-1">{row.title}</span>
      </Select>
    </div>
  );
}

// Octicons' `dependabot`: its two paths run together, which one `d` draws the same.
const ROBOT =
  "M5.75 7.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75Zm5.25.75a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0v-1.5ZM6.25 0h2A.75.75 0 0 1 9 .75V3.5h3.25a2.25 2.25 0 0 1 2.25 2.25V8h.75a.75.75 0 0 1 0 1.5h-.75v2.75a2.25 2.25 0 0 1-2.25 2.25h-8.5a2.25 2.25 0 0 1-2.25-2.25V9.5H.75a.75.75 0 0 1 0-1.5h.75V5.75A2.25 2.25 0 0 1 3.75 3.5H7.5v-2H6.25a.75.75 0 0 1 0-1.5ZM3 5.75v6.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-6.5a.75.75 0 0 0-.75-.75h-8.5a.75.75 0 0 0-.75.75Z";

const CHEVRON_RIGHT =
  "M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z";

/**
 * The two answers to "which bots can proke you", in the panel's words, and the exceptions each
 * one takes. `title` is what the toggle and the row say; `detail` is the line under the toggle.
 * `field`, `fieldDetail` and `count` are the list that goes with the answer - let through under
 * one, kept out under the other - and what the row calls the logins on it.
 */
const BOT_MODE_OPTIONS: readonly (SegmentOption<BotMode> & {
  detail: string;
  field: string;
  fieldDetail: string;
  count: string;
})[] = [
  {
    value: "all",
    title: "All bots",
    detail: "Reviews, review requests and merges from any bot. Never their comments or mentions.",
    field: "Blocked bots",
    fieldDetail: "Never prokes you, even if it looks human.",
    count: "blocked",
  },
  {
    value: "none",
    title: "No bots",
    detail: "Nothing from GitHub Apps, or logins ending in -bot.",
    field: "Allowed bots",
    fieldDetail: "Always prokes you, comments and mentions included, the way a person would.",
    count: "allowed",
  },
];

/**
 * The bots: which of the two answers is picked, how many exceptions it has, and the way into
 * changing either.
 *
 * Drawn like the digest beside it - icon, name, a line saying what it is about - with the pick
 * where the digest has its tick and a chevron saying there is more behind it, since an answer
 * and a list are not a thing a tick can say.
 */
function BotsRow({
  mode,
  allowed,
  blocked,
  onSetMode,
  onSetAllowed,
  onSetBlocked,
}: {
  mode: BotMode;
  allowed: string[];
  blocked: string[];
  onSetMode: (mode: BotMode) => void;
  onSetAllowed: (logins: string[]) => void;
  onSetBlocked: (logins: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = BOT_MODE_OPTIONS.find((option) => option.value === mode) ?? BOT_MODE_OPTIONS[0];
  // Only the list the answer reads: the other is kept for coming back to, and does nothing now.
  const exceptions = mode === "none" ? allowed : blocked;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50",
          "focus-visible:outline-2 focus-visible:-outline-offset-2"
        )}
      >
        <Octicon
          path={ROBOT}
          className={cn(
            "shrink-0 transition-colors",
            mode === "all" && exceptions.length === 0
              ? "text-muted-foreground"
              : "text-foreground"
          )}
        />
        <span className="flex-1">
          Bots
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            Which bots can proke you, and which are the exceptions.
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          {current.title}
          {exceptions.length > 0 ? ` · ${exceptions.length} ${current.count}` : null}
          <Octicon path={CHEVRON_RIGHT} className="size-3.5 shrink-0" />
        </span>
      </button>

      <BotsDialog
        open={open}
        onClose={() => setOpen(false)}
        mode={mode}
        allowed={allowed}
        blocked={blocked}
        onSetMode={onSetMode}
        onSetAllowed={onSetAllowed}
        onSetBlocked={onSetBlocked}
      />
    </>
  );
}

/**
 * Which bots can proke you, and the exceptions: one toggle, and the one list that goes with
 * where it is.
 *
 * All bots takes a list of the bots to keep out; No bots takes a list of the bots to let in.
 * Each answer keeps its own list, so switching never turns the bots somebody let in into the
 * bots they keep out - the other list is only hidden, and is there again on the way back.
 *
 * Everything saves as it is chosen, like every switch on the panel - there is nothing to submit,
 * and Done only closes.
 */
function BotsDialog({
  open,
  onClose,
  mode,
  allowed,
  blocked,
  onSetMode,
  onSetAllowed,
  onSetBlocked,
}: {
  open: boolean;
  onClose: () => void;
  mode: BotMode;
  allowed: string[];
  blocked: string[];
  onSetMode: (mode: BotMode) => void;
  onSetAllowed: (logins: string[]) => void;
  onSetBlocked: (logins: string[]) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const listId = useId();
  // Focus lands on the answer already picked, which is the first thing anybody comes to change.
  const pickedRef = useRef<HTMLButtonElement>(null);
  const current = BOT_MODE_OPTIONS.find((option) => option.value === mode) ?? BOT_MODE_OPTIONS[0];
  const letIn = mode === "none";

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocusRef={pickedRef}
    >
      <h2 id={titleId} className="text-sm font-medium">
        Bots
      </h2>
      <p id={descriptionId} className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Which bots can proke you, and the exceptions.
      </p>

      <Segmented
        label="Which bots can proke you"
        options={BOT_MODE_OPTIONS}
        value={mode}
        pickedRef={pickedRef}
        onPick={onSetMode}
        className="mt-4"
      />
      <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{current.detail}</p>

      <div className="mt-4 border-t pt-0.5">
        {/*
          Keyed on the answer, so switching swaps one list for the other rather than handing
          whatever was half-typed into one field to the other list.
        */}
        <AccountsField
          key={mode}
          id={listId}
          label={current.field}
          detail={current.fieldDetail}
          logins={letIn ? allowed : blocked}
          removeLabel={(login) => (letIn ? `Stop allowing ${login}` : `Stop blocking ${login}`)}
          onChange={letIn ? onSetAllowed : onSetBlocked}
        />
      </div>

      <div className="mt-5 flex justify-end">
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}

interface SegmentOption<T extends string> {
  value: T;
  title: string;
}

/**
 * Two or more answers side by side, one of them picked - the inbox's time window, at the width
 * of the dialog.
 *
 * `aria-pressed` buttons in a labelled group, the way the inbox's are, rather than radios: each
 * is a press that takes effect at once, and there is nothing to submit.
 */
function Segmented<T extends string>({
  label,
  options,
  value,
  pickedRef,
  onPick,
  className,
}: {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  pickedRef?: RefObject<HTMLButtonElement | null>;
  onPick: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex gap-1", className)}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            ref={selected ? pickedRef : undefined}
            type="button"
            aria-pressed={selected}
            onClick={() => onPick(option.value)}
            className={cn(
              "flex-1 rounded-md py-1.5 text-center text-[12px] font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:-outline-offset-2",
              selected
                ? "bg-primary text-primary-foreground"
                : "bg-foreground/10 text-muted-foreground hover:bg-foreground/20 hover:text-foreground"
            )}
          >
            {option.title}
          </button>
        );
      })}
    </div>
  );
}

/** The list: what it is, what being on it does, and the logins on it. */
function AccountsField({
  id,
  label,
  detail,
  logins,
  removeLabel,
  onChange,
}: {
  id: string;
  label: string;
  detail: string;
  logins: string[];
  removeLabel: (login: string) => string;
  onChange: (logins: string[]) => void;
}) {
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block cursor-default">
        <span className="block text-[13px] font-medium leading-snug text-foreground">
          {label}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
          {detail}
        </span>
      </label>

      <LoginsInput
        id={id}
        logins={logins}
        onChange={onChange}
        placeholder="Add a login…"
        removeLabel={removeLabel}
        normalize={normalizeAccountLogin}
      />
    </div>
  );
}

/**
 * The inbox's spelling, with a `[bot]` dropped as well: somebody naming a GitHub App types
 * whichever they saw, and the server stores `dependabot` for both. Dropped here too so the chip
 * on screen does not change its spelling the moment the save comes back.
 *
 * Nothing at all for what could not be a GitHub login, which the server would refuse: the field
 * keeps it for correcting, where a chip would appear and then vanish behind this dialog with the
 * refusal written somewhere underneath it.
 */
function normalizeAccountLogin(value: string): string {
  const login = normalizeLogin(value).replace(/\[bot\]$/, "");

  return /^[a-z0-9][a-z0-9-]{0,38}$/.test(login) ? login : "";
}

const CLOCK =
  "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z";

/** No detail line under any of them: "9am" is the whole of what picking it does. */
const DIGEST_HOURS: readonly SelectOption<string>[] = Array.from(
  { length: 24 },
  (_unused, hour) => ({
    value: String(hour),
    title: hourName(hour),
  })
);

function hourName(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";

  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/**
 * The digest, which is a schedule rather than a kind of poke.
 *
 * Under the reel rather than in the list above it: a row up there is counted in the header and
 * previewed in the window, and this would be the tenth of nine kinds with no card to show. The
 * footer it sits in is the panel's, which it shares with the bots.
 */
function DigestRow({
  enabled,
  hour,
  onSetEnabled,
  onSetHour,
}: {
  enabled: boolean;
  hour: number;
  onSetEnabled: (enabled: boolean) => void;
  onSetHour: (hour: number) => void;
}) {
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onSetEnabled(!enabled)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50"
      >
        <Octicon
          path={CLOCK}
          className={cn(
            "shrink-0 transition-colors",
            enabled ? "text-foreground" : "text-muted-foreground/40"
          )}
        />
        <span className="flex-1">
          A daily digest
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            What is still waiting on your review, once a day.
          </span>
        </span>
        <Tick on={enabled} />
      </button>

      {enabled ? (
        <Select
          label="When the digest arrives"
          options={DIGEST_HOURS}
          value={String(hour)}
          onChange={(value) => onSetHour(Number(value))}
          className="px-2 py-1.5 text-sm hover:bg-accent/50"
        >
          <span className="flex-1 text-muted-foreground">Sent at</span>
        </Select>
      ) : null}
    </>
  );
}

/** A tick, or the ring that holds its place. The same width either way, so nothing shuffles. */
function Tick({ on }: { on: boolean }) {
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center">
      {on ? (
        <Octicon path={CHECK} size={12} className="text-emerald-500/80" />
      ) : (
        <span
          aria-hidden="true"
          className="size-3 rounded-full border border-muted-foreground/30"
        />
      )}
    </span>
  );
}
