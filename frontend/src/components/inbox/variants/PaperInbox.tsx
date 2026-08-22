import { cn } from "@/lib/utils";
import { useState } from "react";
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
 * Variant: light, and quiet about it.
 *
 * No rules, no boxes, no status glyphs - separation is space, and hierarchy is type size. The
 * only line on the page is the one down the middle, and even that is a hairline.
 *
 * Worth trying because every other variant here assumes the answer to "how do I tell these
 * apart" is a border. This one spends the same budget on whitespace and finds out whether a
 * list of sixteen things still reads.
 */

function Row({
  pullRequest,
  index,
}: {
  pullRequest: MockPullRequest;
  index: number;
}) {
  return (
    <li
      style={{ animationDelay: `${Math.min(index, 10) * 32}ms` }}
      className="animate-rise-in"
    >
      <a
        href={`https://github.com/${pullRequest.repo}/pull/${pullRequest.number}`}
        target="_blank"
        rel="noreferrer"
        className="group flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent"
      >
        <ActorAvatar actor={pullRequest.author} size={22} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[15px] leading-snug decoration-1 underline-offset-2 group-hover:underline",
              pullRequest.isDraft ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {pullRequest.title}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {pullRequest.repo}
            <span className="text-muted-foreground/60">
              {" "}
              #{pullRequest.number}
            </span>
            <span className="text-muted-foreground/40"> · </span>
            {pullRequest.author.login}
          </p>
        </div>
      </a>
    </li>
  );
}

function Section<K>({
  section,
  rows,
  defaultOpen = true,
}: {
  section: SectionSpec<K>;
  rows: MockPullRequest[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mb-8 last:mb-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        className="mb-1 flex w-full items-baseline gap-2 px-3 text-left"
      >
        <h3 className="text-[13px] font-medium tracking-tight">
          {section.title}
        </h3>
        {/* The blurb earns its place here: with no glyphs on the rows, the words are the only
            thing saying what these have in common. */}
        <span className="truncate text-[12px] text-muted-foreground/70">
          {section.blurb}
        </span>
        <span className="ml-auto shrink-0 text-[12px] text-muted-foreground/50">
          {open ? "hide" : `show ${rows.length}`}
        </span>
      </button>
      {open ? (
        <ul>
          {rows.map((row, i) => (
            <Row key={row.id} pullRequest={row} index={i} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function PaperInbox() {
  return (
    <div className="theme-paper min-h-full w-full bg-background text-foreground">
      <header className="mx-auto flex max-w-[100rem] items-baseline gap-3 px-8 pb-2 pt-8">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Everything open, on both sides of you.
        </p>
        <span className="ml-auto text-xs text-muted-foreground">
          16 repositories · refreshed 2 minutes ago
        </span>
      </header>

      <div className="mx-auto grid max-w-[100rem] gap-10 px-5 pb-16 pt-6 xl:grid-cols-2 xl:gap-0">
        <div className="xl:border-r xl:border-rule xl:pr-10">
          <h2 className="mb-5 px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Yours
          </h2>
          {MINE_SECTIONS.map((section) => (
            <Section
              key={section.key}
              section={section}
              rows={mineIn(section.key)}
              defaultOpen={section.key !== "drafts"}
            />
          ))}
        </div>

        <div className="xl:pl-10">
          <h2 className="mb-5 px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Waiting on you
          </h2>
          {REVIEW_SECTIONS.map((section) => (
            <Section
              key={section.key}
              section={section}
              rows={reviewsIn(section.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
