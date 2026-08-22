import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import { FilterIcon } from "../../icons";
import { ActorAvatar } from "../../PullRequestRow";
import type { MockPullRequest } from "../../mock";

/**
 * The pieces the five dark paper variants share, so what differs between any two of them is
 * colour and placement rather than a row that drifted.
 *
 * Paper's rules, kept: no borders anywhere, no status glyphs, separation by space, hierarchy by
 * type size. Stripped further from the original on request - a section is a word, the header is
 * a word and a control, and nothing on the page explains itself.
 */

/** Everything at the top of every one of these. Two things, and no sentence between them. */
export function PaperHeader({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <header className={cn("flex items-baseline gap-4", className)}>
      <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
      {children}
      <ReposControl className="ml-auto" />
    </header>
  );
}

/** Looks like the real control, does nothing. The only chrome left. */
export function ReposControl({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={(event) => event.preventDefault()}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <FilterIcon className="size-3.5" />
      16 repos
    </button>
  );
}

/**
 * One pull request. Avatar, title, and the line that says where it lives.
 *
 * A draft is told apart by the weight of its title and nothing else - no badge, no glyph. It is
 * the one distinction paper can make without adding an object to the row.
 */
export function PaperRow({
  pullRequest,
  index,
  className,
}: {
  pullRequest: MockPullRequest;
  index: number;
  className?: string;
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
        className={cn(
          "group flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent",
          className,
        )}
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
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
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

/**
 * A section title.
 *
 * The whole heading is the toggle, with no label on it - the "hide" text that used to sit on the
 * right was the loudest thing in a layout whose entire argument is restraint. What tells you a
 * section is shut is that its rows are not there.
 */
export function PaperHeading({
  title,
  open,
  onToggle,
  className,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "block w-full text-left text-[13px] font-medium tracking-tight transition-colors",
        open
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {title}
    </button>
  );
}

/** Open unless it is drafts, which are a note to yourself rather than a queue. */
export function useSection(key: string) {
  const [open, setOpen] = useState(key !== "drafts");
  return { open, toggle: () => setOpen((was) => !was) };
}
