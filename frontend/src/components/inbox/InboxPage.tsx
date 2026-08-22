import { FilterIcon } from "./icons";
import { InboxSection } from "./InboxSection";
import { MINE_SECTIONS, REVIEW_SECTIONS, mineIn, reviewsIn } from "./sections";

/**
 * The review inbox.
 *
 * Two piles - your own open pull requests on the left, other people's waiting on you on the
 * right - divided by a single hairline, which is the only line on the page. Everything else is
 * separated by space and ranked by type size.
 *
 * What is deliberately absent is most of the design: no borders round anything, no status
 * glyphs, no counts, no dates, and no sentence anywhere explaining what a section means. Every
 * one of those was tried and taken out again. A row carries a title, where it lives, and who
 * wrote it, because anything more specific is a reason to open it rather than a substitute for
 * doing so.
 *
 * Nothing animates in. The cascade was pleasant once and a tax on every load after it, and this
 * is a page somebody opens twenty times a day.
 */

/** Looks like the real control, does nothing. The only chrome on the page. */
function ReposControl() {
  return (
    <button
      type="button"
      onClick={(event) => event.preventDefault()}
      className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <FilterIcon className="size-3.5" />
      16 repos
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

export function InboxPage() {
  return (
    <div className="theme-ink min-h-dvh w-full bg-background text-foreground">
      <header className="mx-auto flex max-w-[100rem] items-baseline gap-4 px-8 pb-2 pt-8">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <ReposControl />
      </header>

      {/*
        Side by side from `xl` up, stacked below it. What you owe other people and what other
        people owe you are different jobs; putting one under the other means the second is only
        ever reached by scrolling past the first.
      */}
      <div className="mx-auto grid max-w-[100rem] gap-10 px-5 pb-16 pt-6 xl:grid-cols-2 xl:gap-0">
        {/* `min-w-0`, or the longest title sets the column width and pushes the other one off
            the page instead of truncating. */}
        <div className="min-w-0 xl:border-r xl:border-rule xl:pr-10">
          <PileLabel>Yours</PileLabel>
          {MINE_SECTIONS.map((section) => (
            <InboxSection
              key={section.key}
              sectionKey={section.key}
              title={section.title}
              rows={mineIn(section.key)}
            />
          ))}
        </div>

        <div className="min-w-0 xl:pl-10">
          <PileLabel>Waiting on you</PileLabel>
          {REVIEW_SECTIONS.map((section) => (
            <InboxSection
              key={section.key}
              sectionKey={section.key}
              title={section.title}
              rows={reviewsIn(section.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
