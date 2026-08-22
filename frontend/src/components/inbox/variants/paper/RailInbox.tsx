import { cn } from "@/lib/utils";
import {
  MINE_SECTIONS,
  REVIEW_SECTIONS,
  mineIn,
  reviewsIn,
} from "../../sections";
import { PaperHeader, PaperRow } from "./shared";
import type { MockPullRequest } from "../../mock";

/**
 * Rail - the sections leave the page and become a way in.
 *
 * The others make you scroll past a section to reach the next one. Here the section titles live
 * in a rail down the left, and the content is a single continuous list with quiet markers in it -
 * so the titles are permanently visible and permanently clickable, and the reading surface has
 * nothing on it but pull requests.
 *
 * The rail is also the only place in any of these variants where a count survives. It earns it
 * there: away from the rows, a number is the only thing that can say how much is behind a name.
 */

interface RailSection {
  id: string;
  title: string;
  pile: string;
  rows: MockPullRequest[];
}

function sections(): RailSection[] {
  return [
    ...MINE_SECTIONS.map((section) => ({
      id: `s-${section.key}`,
      title: section.title,
      pile: "Yours",
      rows: mineIn(section.key),
    })),
    ...REVIEW_SECTIONS.map((section) => ({
      id: `s-${section.key}`,
      title: section.title,
      pile: "Waiting on you",
      rows: reviewsIn(section.key),
    })),
  ];
}

export function RailInbox() {
  const all = sections();
  let lastPile = "";

  return (
    <div className="theme-plum min-h-full w-full bg-background text-foreground">
      <div className="mx-auto flex max-w-[90rem] gap-10 px-6 pb-24 lg:gap-16">
        <nav className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col pt-14 lg:flex">
          {all.map((section, index) => {
            const newPile = section.pile !== all[index - 1]?.pile;

            return (
              <div key={section.id}>
                {newPile ? (
                  <p
                    className={cn(
                      "px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/60",
                      index > 0 ? "pt-7" : null,
                    )}
                  >
                    {section.pile}
                  </p>
                ) : null}
                <a
                  href={`#${section.id}`}
                  className="flex items-baseline gap-2 rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {section.title}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/50">
                    {section.rows.length}
                  </span>
                </a>
              </div>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1">
          <PaperHeader className="pb-10 pt-14" />

          {all.map((section) => {
            const showPile = section.pile !== lastPile;
            lastPile = section.pile;

            return (
              <section key={section.id} id={section.id} className="scroll-mt-6">
                {showPile ? (
                  <h2 className="mb-6 mt-10 border-b border-rule px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground lg:hidden">
                    {section.pile}
                  </h2>
                ) : null}
                <h3 className="mb-1.5 px-3 pt-6 text-[13px] font-medium tracking-tight">
                  {section.title}
                </h3>
                <ul className="mb-4">
                  {section.rows.map((row, index) => (
                    <PaperRow key={row.id} pullRequest={row} index={index} />
                  ))}
                </ul>
              </section>
            );
          })}
        </main>
      </div>
    </div>
  );
}
