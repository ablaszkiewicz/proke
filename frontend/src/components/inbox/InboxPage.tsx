import type { InboxSectionData } from "@/lib/api/inbox.api";
import type { ReactNode } from "react";
import { FilterIcon } from "./icons";
import { InboxSection } from "./InboxSection";

/**
 * The review inbox.
 *
 * Two piles - your own open pull requests on the left, other people's waiting on you on the
 * right - separated by nothing but the gutter, which is why the gutter is wide. Everything else
 * is ranked by type size.
 *
 * What is deliberately absent is most of the design: no borders round anything, no status
 * glyphs, no counts, no dates, and no sentence anywhere explaining what a section means. Every
 * one of those was tried and taken out again. A row carries a title, where it lives, and who
 * wrote it, because anything more specific is a reason to open it rather than a substitute for
 * doing so.
 *
 * Nothing animates in. The cascade was pleasant once and a tax on every load after it, and this
 * is a page somebody opens twenty times a day.
 *
 * Presentational: takes data and renders it, so the same page can be driven by the logic next
 * door or by a fixture.
 */

export interface InboxPageProps {
  yours: InboxSectionData[];
  waitingOnYou: InboxSectionData[];
  /** A trip to GitHub is in flight, behind rows that are already on screen. */
  refreshing: boolean;
  /** An older answer, served because the refresh behind it failed. */
  stale: boolean;
  /**
   * Whether GitHub has ever answered for this person.
   *
   * What separates "nothing to do" from "we do not know yet". An empty pile may only claim the
   * first when this is true; on false the page has rows it never got rather than rows that are
   * not there, and saying otherwise is a confident lie about somebody's workload.
   */
  hasAnswer: boolean;
  /** proke holds no usable GitHub authorization. Nothing can be refreshed until they reconnect. */
  githubReauthRequired: boolean;
}

/** Looks like the real control, does nothing yet. The only chrome on the page. */
function ReposControl() {
  return (
    <button
      type="button"
      onClick={(event) => event.preventDefault()}
      className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <FilterIcon className="size-3.5" />
      All repos
    </button>
  );
}

/** The label over a pile. The smallest type on the page, and the only thing in that register. */
function PileLabel({ children }: { children: string }) {
  return (
    <h2 className="mb-5 px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h2>
  );
}

/**
 * A whole pile with nothing in it.
 *
 * Its own line rather than an absent column, because "you owe nobody anything" is a result worth
 * being told, and a column that vanished when it emptied would move the other one across the
 * page every time somebody finished their last review.
 */
function Pile({
  label,
  sections,
  empty,
  hasAnswer,
}: {
  label: string;
  sections: InboxSectionData[];
  empty: ReactNode;
  hasAnswer: boolean;
}) {
  const isEmpty = sections.every(
    (section) => section.pullRequests.length === 0
  );

  return (
    <div className="min-w-0">
      <PileLabel>{label}</PileLabel>
      {isEmpty ? (
        <p className="px-3 text-[13px] text-muted-foreground">
          {hasAnswer ? empty : "Couldn't reach GitHub."}
        </p>
      ) : (
        sections.map((section) => (
          <InboxSection key={section.key} section={section} />
        ))
      )}
    </div>
  );
}

export function InboxPage({
  yours,
  waitingOnYou,
  refreshing,
  stale,
  hasAnswer,
  githubReauthRequired,
}: InboxPageProps) {
  return (
    <div className="theme-ink min-h-dvh w-full bg-background text-foreground">
      <header className="mx-auto flex max-w-[100rem] items-baseline gap-4 px-8 pb-2 pt-8">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <Status
          refreshing={refreshing}
          stale={stale}
          githubReauthRequired={githubReauthRequired}
        />
        <ReposControl />
      </header>

      {/*
        Side by side from `xl` up, stacked below it. What you owe other people and what other
        people owe you are different jobs; putting one under the other means the second is only
        ever reached by scrolling past the first.

        Nothing divides them but the gutter, which is why the gutter is wide. A rule down the
        middle would be the only line on the page, and a page that has argued itself down to no
        borders anywhere should not keep one purely to say "these are two things" - the labels
        over each column already say it.
      */}
      <div className="mx-auto grid max-w-[100rem] gap-y-14 px-5 pb-16 pt-6 xl:grid-cols-2 xl:gap-x-28 xl:gap-y-0">
        <Pile
          label="Yours"
          sections={yours}
          empty="Nothing open."
          hasAnswer={hasAnswer}
        />
        <Pile
          label="Waiting on you"
          sections={waitingOnYou}
          empty="Nobody is waiting on you."
          hasAnswer={hasAnswer}
        />
      </div>
    </div>
  );
}

/**
 * The one line on the page allowed to talk about the page.
 *
 * Only ever says something when there is something wrong or something pending; the healthy state
 * renders nothing at all, which is the only state most people ever see.
 */
function Status({
  refreshing,
  stale,
  githubReauthRequired,
}: {
  refreshing: boolean;
  stale: boolean;
  githubReauthRequired: boolean;
}) {
  if (githubReauthRequired) {
    return (
      <a
        href="/app"
        className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
      >
        Reconnect GitHub to refresh this
      </a>
    );
  }

  // Above `stale`, deliberately: while a refresh is running, "checking GitHub" is both true
  // and the more useful of the two - the staleness it is about to resolve is old news.
  if (refreshing) {
    return (
      <span className="text-xs text-muted-foreground">Checking GitHub…</span>
    );
  }

  if (stale) {
    return (
      <span className="text-xs text-muted-foreground">
        Showing the last answer GitHub gave
      </span>
    );
  }

  return null;
}
