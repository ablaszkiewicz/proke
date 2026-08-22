import { ProkeLogo } from "@/components/ui/ProkeLogo";
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import { FilterIcon, RefreshIcon } from "./icons";
import { InboxSection } from "./InboxSection";
import { ActorAvatar, PullRequestRow } from "./PullRequestRow";
import {
  MOCK_MINE,
  MOCK_REVIEWS,
  MOCK_VIEWER,
  type MineSectionKey,
  type MockReviewRequest,
} from "./mock";

/**
 * The two piles, and the sections inside each.
 *
 * Order is the whole design here. Within "Yours" the sections run from least to most work
 * outstanding - a merge button, then a thread to answer, then a wait on somebody else - so the
 * top of the column is always the thing you can finish. Within "Waiting on you" they run by how
 * much your answer is worth to a person: your team is blocked on you, a stranger is
 * inconvenienced, and a dependency bump is neither.
 */
const MINE_SECTIONS: { key: MineSectionKey; title: string }[] = [
  { key: "ready-to-merge", title: "Approved" },
  { key: "unresolved-comments", title: "Unresolved comments" },
  { key: "waiting-for-reviewers", title: "Waiting for reviewers" },
];

const REVIEW_SECTIONS: { key: MockReviewRequest["group"]; title: string }[] = [
  { key: "team", title: "Your team" },
  { key: "others", title: "Everyone else" },
  { key: "bots", title: "Bots" },
];

/**
 * One column: a quiet header strip and the sections under it.
 *
 * The label is deliberately the smallest type on the page. In two columns divided by a hard
 * rule, position already says which pile you are looking at, so the label only has to confirm
 * it - competing with the section titles underneath would invert the hierarchy.
 */
function InboxArea({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // `min-w-0` is load-bearing: a grid item defaults to min-content width, which would let the
    // longest pull request title set the column and push the other one off the page instead of
    // truncating. `@container` is what the rows inside measure themselves against.
    <section className={cn("@container flex min-w-0 flex-col", className)}>
      <header className="border-b bg-card px-4 py-2">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
      </header>
      <div>{children}</div>
    </section>
  );
}

/** Oldest ask first - see askedHoursAgo. The age decides the order and is never shown. */
function reviewsIn(group: MockReviewRequest["group"]): MockReviewRequest[] {
  return MOCK_REVIEWS.filter((review) => review.group === group).sort(
    (a, b) => b.askedHoursAgo - a.askedHoursAgo,
  );
}

/**
 * The one thing this page can say that github.com cannot: proke knows which accounts it is
 * *not* installed on, because that is the same list the connections page is built from.
 */
function CoverageNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex animate-fade-in items-center gap-3 border-b bg-card/40 px-4 py-2.5 text-xs">
      <span className="text-muted-foreground">
        Reviews in <span className="text-foreground">cryptly-dev</span> and{" "}
        <span className="text-foreground">corelabsltd</span> aren't shown —
        proke isn't installed there.
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="bg-primary px-2 py-1 text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Install
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Looks like the real control, does nothing - same contract as the drafts gallery's buttons. */
function MockControl({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(event) => event.preventDefault()}
      className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

/**
 * The review inbox, on mock data.
 *
 * Public and unauthenticated on purpose: this is a layout to argue about, and it should be
 * openable from a phone in a meeting without a session. Nothing here talks to the API, and the
 * badge in the header says so - a page that looks like real data and is not is worse than no
 * page at all.
 *
 * Edge to edge, and square everywhere something has a border. The only round things left are
 * the avatars and the unread dot, which are a photograph and a dot rather than a frame.
 */
export function InboxPage() {
  const [coverageDismissed, setCoverageDismissed] = useState(false);
  const drafts = MOCK_MINE.drafts;

  return (
    <div className="theme-github flex min-h-screen w-full animate-fade-in flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ProkeLogo size={22} />
          <span className="text-sm font-semibold tracking-tight">proke</span>
        </div>

        <span className="text-sm text-muted-foreground">/</span>
        <h1 className="text-sm font-medium">Inbox</h1>

        <span className="border border-dashed px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Mock data
        </span>

        <div className="ml-auto flex items-center gap-2">
          <MockControl>
            <FilterIcon className="size-3.5" />
            16 repos
          </MockControl>
          <MockControl title="Refreshed from GitHub 2 minutes ago">
            <RefreshIcon className="size-3.5" />
            2m ago
          </MockControl>
          <ActorAvatar actor={MOCK_VIEWER} size={26} />
        </div>
      </header>

      {!coverageDismissed ? (
        <CoverageNote onDismiss={() => setCoverageDismissed(true)} />
      ) : null}

      {/*
        Side by side from `xl` up, stacked below it, divided by a hard rule rather than a gap.
        What you owe other people and what other people owe you are different jobs; putting one
        under the other means the second is only ever reached by scrolling past the first.
      */}
      <div className="grid flex-1 xl:grid-cols-2">
        <InboxArea
          title="Yours"
          className="border-b border-rule xl:border-b-0 xl:border-r"
        >
          {MINE_SECTIONS.map((section) => (
            <InboxSection
              key={section.key}
              title={section.title}
              count={MOCK_MINE[section.key].length}
            >
              {MOCK_MINE[section.key].map((pullRequest, index) => (
                <PullRequestRow
                  key={pullRequest.id}
                  pullRequest={pullRequest}
                  index={index}
                  showChecks
                />
              ))}
            </InboxSection>
          ))}

          {/*
            Closed by default, and the only section that is. A draft is a note to yourself: worth
            being able to find, never worth being shown the state of every time the page opens.
          */}
          <InboxSection
            title="Drafts"
            count={drafts.length}
            defaultOpen={false}
          >
            {drafts.map((pullRequest, index) => (
              <PullRequestRow
                key={pullRequest.id}
                pullRequest={pullRequest}
                index={index}
                showChecks
              />
            ))}
          </InboxSection>
        </InboxArea>

        <InboxArea title="Waiting on you">
          {REVIEW_SECTIONS.map((section) => {
            const reviews = reviewsIn(section.key);

            return (
              <InboxSection
                key={section.key}
                title={section.title}
                count={reviews.length}
                emptyText="Nobody is waiting on you here."
              >
                {reviews.map((review, index) => (
                  <PullRequestRow
                    key={review.id}
                    pullRequest={review}
                    index={index}
                    // No CI here: something asking for your review gets opened
                    // either way, so a green tick does not change what you do.
                    showReviewers
                  />
                ))}
              </InboxSection>
            );
          })}
        </InboxArea>
      </div>
    </div>
  );
}
