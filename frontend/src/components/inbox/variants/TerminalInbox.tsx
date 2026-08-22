import { cn } from "@/lib/utils";
import { useState } from "react";
import type { MockPullRequest } from "../mock";
import {
  MINE_SECTIONS,
  REVIEW_SECTIONS,
  mineIn,
  reviewsIn,
  type SectionSpec,
} from "../sections";

/**
 * Variant: everything is text.
 *
 * No avatars, no icons, no columns of glyphs - a status is a token you can read aloud, and the
 * repository is part of the sentence rather than a field under it. One column rather than two,
 * because a terminal scrolls; the two piles are headings in the same stream.
 *
 * Worth trying because it is the densest this list can get: eighteen pull requests fit above the
 * fold with room to spare, and nothing on the row is decoration.
 */

const STATUS: Record<
  MockPullRequest["checks"],
  { text: string; className: string }
> = {
  success: { text: "[ ok ]", className: "text-primary" },
  failure: { text: "[fail]", className: "text-destructive" },
  pending: { text: "[ .. ]", className: "text-amber-400" },
  none: { text: "[ -- ]", className: "text-muted-foreground/50" },
};

function Row({
  pullRequest,
  index,
  showStatus,
}: {
  pullRequest: MockPullRequest;
  index: number;
  showStatus: boolean;
}) {
  const status = STATUS[pullRequest.checks];

  return (
    <li
      style={{ animationDelay: `${Math.min(index, 12) * 20}ms` }}
      className="animate-fade-in"
    >
      <a
        href={`https://github.com/${pullRequest.repo}/pull/${pullRequest.number}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-baseline gap-3 px-4 py-[3px] transition-colors hover:bg-accent"
      >
        <span
          className={cn(
            "shrink-0",
            showStatus ? status.className : "text-transparent",
          )}
        >
          {status.text}
        </span>
        <span className="hidden w-56 shrink-0 truncate text-muted-foreground @2xl:inline">
          {pullRequest.repo.toLowerCase()}#{pullRequest.number}
        </span>
        <span className="min-w-0 flex-1 truncate text-foreground">
          {pullRequest.isDraft ? (
            <span className="text-muted-foreground/70">~ </span>
          ) : null}
          {pullRequest.title}
        </span>
        <span className="hidden w-40 shrink-0 truncate text-right text-muted-foreground @3xl:inline">
          @{pullRequest.author.login}
        </span>
      </a>
    </li>
  );
}

function Section<K>({
  section,
  rows,
  showStatus,
  defaultOpen = true,
}: {
  section: SectionSpec<K>;
  rows: MockPullRequest[];
  showStatus: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        className="flex w-full items-center gap-2 px-4 py-1 text-left text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="w-3 shrink-0">{open ? "▾" : "▸"}</span>
        <span className="shrink-0 text-foreground">
          {section.title.toLowerCase()}
        </span>
        {/* The dashed run-out. A rule made of the same characters as everything else. */}
        <span
          aria-hidden="true"
          className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-muted-foreground/25"
        >
          {"─".repeat(200)}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground/70">
          {String(rows.length).padStart(2, "0")}
        </span>
      </button>
      {open ? (
        <ul>
          {rows.map((row, index) => (
            <Row
              key={row.id}
              pullRequest={row}
              index={index}
              showStatus={showStatus}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TerminalInbox() {
  return (
    <div className="theme-terminal @container min-h-full w-full bg-background font-mono text-[13px] leading-6 text-foreground">
      <header className="flex flex-wrap items-baseline gap-x-3 border-b border-rule px-4 py-2">
        <span className="text-primary">proke</span>
        <span className="text-muted-foreground">:</span>
        <span>inbox</span>
        <span className="ml-auto text-muted-foreground">
          16 repos · synced 2m ago
        </span>
      </header>

      <main className="py-2">
        <p className="px-4 py-1 text-muted-foreground">
          <span className="text-foreground">## yours</span>
        </p>
        {MINE_SECTIONS.map((section) => (
          <Section
            key={section.key}
            section={section}
            rows={mineIn(section.key)}
            showStatus
            defaultOpen={section.key !== "drafts"}
          />
        ))}

        <p className="mt-4 px-4 py-1 text-muted-foreground">
          <span className="text-foreground">## waiting on you</span>
        </p>
        {REVIEW_SECTIONS.map((section) => (
          <Section
            key={section.key}
            section={section}
            rows={reviewsIn(section.key)}
            showStatus={false}
          />
        ))}
      </main>
    </div>
  );
}
