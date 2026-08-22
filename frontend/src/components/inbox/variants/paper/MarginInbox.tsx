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
 * Margin - the section title steps out of the way.
 *
 * Everywhere else the title sits above its rows, which costs a line of vertical space per
 * section and puts a small heading directly over a large one. Here it hangs in a left margin
 * beside the rows, right-aligned against them, so the titles form their own quiet column and the
 * pull requests form one unbroken list.
 *
 * The trade: it needs about a hundred and sixty pixels of margin that the rows would otherwise
 * have, so it collapses back to headings-above below `lg`.
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
    <section className="mb-7 last:mb-0 lg:flex lg:gap-6">
      <PaperHeading
        title={title}
        open={open}
        onToggle={toggle}
        className="mb-1.5 px-3 lg:mb-0 lg:w-40 lg:shrink-0 lg:pt-3 lg:text-right"
      />
      {open ? (
        <ul className="min-w-0 flex-1">
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
    <section className="mb-14 last:mb-0">
      <h2 className="mb-6 px-3 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground lg:w-40 lg:pr-0 lg:text-right">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function MarginInbox() {
  return (
    <div className="theme-tide min-h-full w-full bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 pb-24">
        <PaperHeader className="pb-10 pt-12" />

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
