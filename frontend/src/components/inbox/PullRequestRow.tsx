import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  CheckCircleIcon,
  ClockCircleIcon,
  DraftPullRequestIcon,
  XCircleIcon,
} from "./icons";
import type { MockActor, MockPullRequest } from "./mock";

/** Gap between one row's entrance and the next, capped so a long section is not a slideshow. */
const STAGGER_MS = 28;
const MAX_STAGGERED = 10;

/** A real avatar where the network allows, initials otherwise - never a broken image. */
export function ActorAvatar({
  actor,
  size = 20,
  className,
}: {
  actor: MockActor;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        style={{ width: size, height: size, fontSize: size * 0.42 }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium uppercase text-muted-foreground",
          className,
        )}
      >
        {actor.login.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      src={actor.avatarUrl}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-full bg-muted", className)}
    />
  );
}

/**
 * Who else was asked.
 *
 * Only shown on other people's pull requests, where the question it answers is "am I the only
 * one on the hook for this". On your own it would be a list of people you chose, which you
 * already know.
 *
 * Hidden below `@lg` - a container query, not a viewport one, because the page puts two of these
 * columns side by side and the width of the window says nothing about the room a row has.
 */
function ReviewerStack({ reviewers }: { reviewers: MockActor[] }) {
  const shown = reviewers.slice(0, 3);
  const rest = reviewers.length - shown.length;

  return (
    <div
      className="hidden w-[4.75rem] items-center justify-end @lg:flex"
      title={
        reviewers.length > 0
          ? `Reviewers: ${reviewers.map((r) => r.login).join(", ")}`
          : "No reviewers requested"
      }
    >
      {reviewers.length === 0 ? (
        <span className="text-xs text-muted-foreground/50">—</span>
      ) : (
        <div className="flex -space-x-1.5">
          {shown.map((reviewer) => (
            <ActorAvatar
              key={reviewer.login}
              actor={reviewer}
              size={18}
              className="ring-2 ring-background"
            />
          ))}
          {rest > 0 ? (
            <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-muted text-[9px] tabular-nums text-muted-foreground ring-2 ring-background">
              +{rest}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * The only status left on a row: is CI green, red, or still going.
 *
 * The review verdict used to sit beside it and does not any more - on your own pull requests the
 * section title already says it ("Approved", "Unresolved comments"), so the glyph was the same
 * fact told twice.
 *
 * Colours are GitHub's own semantic ones rather than Tailwind's, to match the palette, and the
 * three states differ in shape as well as hue so the row survives being read by someone who does
 * not separate red from green.
 */
const CHECKS = {
  success: {
    Icon: CheckCircleIcon,
    className: "text-[#3fb950]",
    label: "Checks passing",
  },
  failure: {
    Icon: XCircleIcon,
    className: "text-[#f85149]",
    label: "Checks failing",
  },
  pending: {
    Icon: ClockCircleIcon,
    className: "text-[#d29922]",
    label: "Checks running",
  },
} as const;

function ChecksCell({ state }: { state: MockPullRequest["checks"] }) {
  if (state === "none") {
    return (
      <span className="w-4 shrink-0 text-center text-xs text-muted-foreground/50">
        —
      </span>
    );
  }

  const { Icon, className, label } = CHECKS[state];

  return (
    <span className="w-4 shrink-0" title={label}>
      <Icon className={cn("size-4", className)} />
    </span>
  );
}

export interface PullRequestRowProps {
  pullRequest: MockPullRequest;
  /** Position within its section, for the entrance cascade. */
  index: number;
  /** CI. On your own pull requests only - see ChecksCell. */
  showChecks?: boolean;
  /** The other people asked. On other people's pull requests only - see ReviewerStack. */
  showReviewers?: boolean;
}

/**
 * One pull request, as one line.
 *
 * Title and `author · repo #number` carry the row; whatever is switched on sits in a fixed-width
 * strip on the right so it lines up down the whole section and can be scanned by shape. No dates
 * of any kind - see mock.ts.
 */
export function PullRequestRow({
  pullRequest,
  index,
  showChecks = false,
  showReviewers = false,
}: PullRequestRowProps) {
  const { title, repo, number, author, isDraft, unread, reviewers } =
    pullRequest;

  return (
    <li
      style={{
        animationDelay: `${Math.min(index, MAX_STAGGERED) * STAGGER_MS}ms`,
      }}
      className="animate-rise-in"
    >
      <a
        href={`https://github.com/${repo}/pull/${number}`}
        target="_blank"
        rel="noreferrer"
        className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60"
      >
        {/* The gutter. Always in the layout so titles start on the same pixel either way. */}
        <span
          aria-hidden="true"
          title={unread ? "New since you last looked" : undefined}
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            unread ? "bg-[#388bfd]" : "bg-transparent",
          )}
        />

        <ActorAvatar actor={author} size={20} />

        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 text-sm text-foreground group-hover:underline">
            {isDraft ? (
              <DraftPullRequestIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : null}
            <span className="truncate">{title}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {author.login} · {repo} #{number}
          </p>
        </div>

        {showReviewers ? <ReviewerStack reviewers={reviewers} /> : null}
        {showChecks ? <ChecksCell state={pullRequest.checks} /> : null}
      </a>
    </li>
  );
}
