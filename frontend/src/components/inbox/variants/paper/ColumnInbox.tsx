import type { ReactNode } from "react";
import {
  MINE_SECTIONS,
  REVIEW_SECTIONS,
  mineIn,
  reviewsIn,
} from "../../sections";
import { PaperHeader, PaperHeading, PaperRow, useSection } from "./shared";
import type { MockPullRequest } from "../../mock";

/**
 * Column - one narrow measure, everything stacked.
 *
 * The two-column layouts put both piles in view at once and pay for it with titles that clip
 * around sixty characters. This gives the whole measure to one column and asks you to scroll
 * instead, which is what a page of prose does and what every one of these rows is.
 *
 * The pile labels do more work here than anywhere else - they are the only thing telling you
 * that you have crossed from your own pull requests into other people's - so they get a rule
 * and a lot of air rather than a corner of the screen.
 */

function Section({
  sectionKey,
  title,
  rows,
}: {
  sectionKey: string;
  title: string;
  rows: MockPullRequest[];
}) {
  const { open, toggle } = useSection(sectionKey);

  return (
    <section className="mb-9 last:mb-0">
      <PaperHeading
        title={title}
        open={open}
        onToggle={toggle}
        className="mb-1.5 px-3"
      />
      {open ? (
        <ul>
          {rows.map((row, index) => (
            <PaperRow key={row.id} pullRequest={row} index={index} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Pile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-16 last:mb-0">
      <h2 className="mb-7 border-b border-rule px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ColumnInbox() {
  return (
    <div className="theme-charcoal min-h-full w-full bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 pb-24">
        <PaperHeader className="pb-10 pt-14" />

        <Pile title="Yours">
          {MINE_SECTIONS.map((section) => (
            <Section
              key={section.key}
              sectionKey={section.key}
              title={section.title}
              rows={mineIn(section.key)}
            />
          ))}
        </Pile>

        <Pile title="Waiting on you">
          {REVIEW_SECTIONS.map((section) => (
            <Section
              key={section.key}
              sectionKey={section.key}
              title={section.title}
              rows={reviewsIn(section.key)}
            />
          ))}
        </Pile>
      </div>
    </div>
  );
}
