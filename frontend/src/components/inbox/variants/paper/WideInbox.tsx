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
 * Wide - the rows wrap instead of stacking.
 *
 * Every other layout here treats a pull request as a line and a section as a stack of them, which
 * means a full-width screen spends most of its pixels on empty gutter. This one lets each section
 * run the whole width and flow its rows into two or three columns, so a section of eight is two
 * screens shorter and the shape of it is visible at once.
 *
 * The cost is reading order: a wrapped grid is scanned left-to-right then down, which is the
 * wrong direction for a list that is sorted. Worth seeing precisely because of that.
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
        className="mb-2 px-3"
      />
      {open ? (
        <ul className="grid gap-x-8 md:grid-cols-2 2xl:grid-cols-3">
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
    <section className="border-b border-rule px-6 py-10 last:border-b-0">
      <h2 className="mb-7 px-3 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function WideInbox() {
  return (
    <div className="theme-moss min-h-full w-full bg-background text-foreground">
      <PaperHeader className="px-9 pb-8 pt-12" />

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
  );
}
