import { cn } from "@/lib/utils";
import { CheckCircleIcon, ClockCircleIcon, XCircleIcon } from "../icons";
import { ActorAvatar } from "../PullRequestRow";
import type { MockPullRequest } from "../mock";
import { MINE_SECTIONS, REVIEW_SECTIONS, mineIn, reviewsIn } from "../sections";

/**
 * Variant: one wide table, with the pile as a column rather than as a place.
 *
 * The two-column layouts spend half the screen width on each pile, which means every title
 * truncates at about sixty characters. This one gives the full width to one table and puts
 * "yours" or "waiting" in a cell, so a long title survives - at the cost of the two piles no
 * longer being visible at a glance.
 *
 * Zebra striping instead of dividers: with this many columns the row is the unit you track
 * across, and a tint holds the eye better than a line under it.
 */

const CHECKS = {
  success: { Icon: CheckCircleIcon, className: "text-[#3fb950]" },
  failure: { Icon: XCircleIcon, className: "text-[#f85149]" },
  pending: { Icon: ClockCircleIcon, className: "text-[#d29922]" },
} as const;

interface GridRow {
  pullRequest: MockPullRequest;
  pile: "Yours" | "Waiting";
  section: string;
}

function rows(): GridRow[] {
  const out: GridRow[] = [];

  for (const section of MINE_SECTIONS) {
    for (const pullRequest of mineIn(section.key)) {
      out.push({ pullRequest, pile: "Yours", section: section.title });
    }
  }
  for (const section of REVIEW_SECTIONS) {
    for (const pullRequest of reviewsIn(section.key)) {
      out.push({ pullRequest, pile: "Waiting", section: section.title });
    }
  }

  return out;
}

const HEAD =
  "sticky top-0 z-10 bg-card px-3 py-2 text-left text-[10px] font-medium uppercase " +
  "tracking-[0.14em] text-muted-foreground shadow-[inset_0_-1px_0_var(--rule)]";

export function GridInbox() {
  const all = rows();

  return (
    <div className="theme-slate min-h-full w-full bg-background text-foreground">
      <header className="flex items-baseline gap-3 border-b border-rule px-4 py-3">
        <h1 className="text-sm font-medium">Inbox</h1>
        <span className="text-xs text-muted-foreground">
          {all.length} open · 16 repos · 2m ago
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(HEAD, "w-24")}>Pile</th>
              <th className={cn(HEAD, "w-48")}>Section</th>
              <th className={HEAD}>Pull request</th>
              <th className={cn(HEAD, "w-56")}>Repository</th>
              <th className={cn(HEAD, "w-40")}>Author</th>
              <th className={cn(HEAD, "w-16 text-center")}>CI</th>
            </tr>
          </thead>
          <tbody>
            {all.map(({ pullRequest: pr, pile, section }, index) => {
              const checks = pr.checks === "none" ? null : CHECKS[pr.checks];

              return (
                <tr
                  key={pr.id}
                  style={{ animationDelay: `${Math.min(index, 14) * 20}ms` }}
                  className={cn(
                    "animate-fade-in transition-colors hover:bg-accent",
                    index % 2 === 1 ? "bg-card/40" : null,
                  )}
                >
                  <td className="px-3 py-2 align-middle">
                    <span
                      className={cn(
                        "inline-block border px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                        pile === "Waiting"
                          ? "border-[#38bdf8]/40 text-[#7dd3fc]"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {pile}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle text-[12px] text-muted-foreground">
                    {section}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <a
                      href={`https://github.com/${pr.repo}/pull/${pr.number}`}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        "hover:underline",
                        pr.isDraft
                          ? "text-muted-foreground"
                          : "text-foreground",
                      )}
                    >
                      {pr.title}
                    </a>
                  </td>
                  <td className="px-3 py-2 align-middle text-[12px] text-muted-foreground">
                    {pr.repo}
                    <span className="text-muted-foreground/50">
                      {" "}
                      #{pr.number}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <ActorAvatar actor={pr.author} size={18} />
                      <span className="truncate">{pr.author.login}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center align-middle">
                    {checks ? (
                      <checks.Icon
                        className={cn("mx-auto size-4", checks.className)}
                      />
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
