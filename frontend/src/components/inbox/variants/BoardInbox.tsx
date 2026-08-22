import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { ActorAvatar } from "../PullRequestRow";
import type { MockPullRequest } from "../mock";
import {
  MINE_SECTIONS,
  REVIEW_SECTIONS,
  mineIn,
  reviewsIn,
  type SectionSpec,
} from "../sections";

/**
 * Variant: the sections become columns, and every pull request becomes a card.
 *
 * The list variants all answer "what is next" by putting the most urgent thing at the top. This
 * one answers "how much is there of each kind" instead - the piles are side by side, so a
 * lopsided week is visible before a single title is read.
 *
 * The trade is honest and worth seeing: cards cost about three times the vertical space of a
 * row, so nothing like sixteen pull requests fits on a screen. It is a status board rather than
 * a work queue.
 */

const DOT: Record<MockPullRequest["checks"], string> = {
  success: "bg-[#3fb950]",
  failure: "bg-[#f85149]",
  pending: "bg-[#d29922]",
  none: "bg-muted-foreground/30",
};

function Card({
  pullRequest,
  index,
  showReviewers,
}: {
  pullRequest: MockPullRequest;
  index: number;
  showReviewers: boolean;
}) {
  return (
    <li
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
      className="animate-rise-in"
    >
      <a
        href={`https://github.com/${pullRequest.repo}/pull/${pullRequest.number}`}
        target="_blank"
        rel="noreferrer"
        className="block border border-border bg-card p-3 transition-colors hover:border-rule hover:bg-accent"
      >
        <div className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className={cn("mt-1.5 size-1.5 shrink-0", DOT[pullRequest.checks])}
          />
          <p
            className={cn(
              "line-clamp-2 text-[13px] leading-snug",
              pullRequest.isDraft ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {pullRequest.title}
          </p>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <ActorAvatar actor={pullRequest.author} size={16} />
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {pullRequest.repo.split("/")[1]} #{pullRequest.number}
          </span>
          {showReviewers && pullRequest.reviewers.length > 1 ? (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
              +{pullRequest.reviewers.length - 1}
            </span>
          ) : null}
        </div>
      </a>
    </li>
  );
}

function Column<K>({
  section,
  rows,
  showReviewers,
}: {
  section: SectionSpec<K>;
  rows: MockPullRequest[];
  showReviewers: boolean;
}) {
  return (
    <div className="flex min-w-60 flex-1 flex-col">
      <div className="mb-2 flex items-baseline gap-2 border-b border-rule pb-1.5">
        <h3 className="text-[12px] font-medium">{section.title}</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground/60">
          {rows.length}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row, index) => (
          <Card
            key={row.id}
            pullRequest={row}
            index={index}
            showReviewers={showReviewers}
          />
        ))}
        {rows.length === 0 ? (
          <li className="border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground/60">
            Empty
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function Band({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-rule px-5 py-5 last:border-b-0">
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-1">{children}</div>
    </section>
  );
}

export function BoardInbox() {
  return (
    <div className="theme-github min-h-full w-full bg-background text-foreground">
      <header className="flex items-baseline gap-3 border-b border-rule px-5 py-3">
        <h1 className="text-sm font-medium">Inbox</h1>
        <span className="text-xs text-muted-foreground">
          Board · 16 repos · 2m ago
        </span>
      </header>

      <Band title="Yours">
        {MINE_SECTIONS.map((section) => (
          <Column
            key={section.key}
            section={section}
            rows={mineIn(section.key)}
            showReviewers={false}
          />
        ))}
      </Band>

      <Band title="Waiting on you">
        {REVIEW_SECTIONS.map((section) => (
          <Column
            key={section.key}
            section={section}
            rows={reviewsIn(section.key)}
            showReviewers
          />
        ))}
      </Band>
    </div>
  );
}
