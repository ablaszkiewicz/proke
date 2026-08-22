import {
  MINE_SECTIONS,
  REVIEW_SECTIONS,
  mineIn,
  reviewsIn,
} from "../../sections";
import { PaperHeader, PaperHeading, PaperRow, useSection } from "./shared";
import type { MockPullRequest } from "../../mock";

/**
 * Ink - paper turned out, and nothing else changed.
 *
 * Same two columns, same hairline down the middle, same spacing to the pixel. The only variable
 * is the palette, which is warm near-black under cream rather than the other way round. Here so
 * that everything below it can be read as a placement decision rather than a colour one.
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
    <section className="mb-8 last:mb-0">
      <PaperHeading
        title={title}
        open={open}
        onToggle={toggle}
        className="mb-1 px-3"
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

export function InkInbox() {
  return (
    <div className="theme-ink min-h-full w-full bg-background text-foreground">
      <PaperHeader className="mx-auto max-w-[100rem] px-8 pb-2 pt-8" />

      <div className="mx-auto grid max-w-[100rem] gap-10 px-5 pb-16 pt-6 xl:grid-cols-2 xl:gap-0">
        <div className="xl:border-r xl:border-rule xl:pr-10">
          <h2 className="mb-5 px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Yours
          </h2>
          {MINE_SECTIONS.map((section) => (
            <Section
              key={section.key}
              sectionKey={section.key}
              title={section.title}
              rows={mineIn(section.key)}
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
