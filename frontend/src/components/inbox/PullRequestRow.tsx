import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  ApprovedIcon,
  AwaitingReviewIcon,
  ChangesRequestedIcon,
  CheckCircleIcon,
  ClockCircleIcon,
  CommentIcon,
  DraftPullRequestIcon,
  XCircleIcon,
} from "./icons";
import type { MockActor, MockPullRequest } from "./mock";

/**
 * The instrument panel sheds columns on the width of its *column*, not of the window - the page
 * puts two of these side by side, so a wide viewport says nothing about the room a row has.
 * Hence `@sm`/`@xl` (container queries) rather than `sm`/`lg`.
 *
 * Threads are the last thing to go: "is there work waiting on me" survives being the only thing
 * left. The reviewer faces drop first, being the most pixels for the least answer.
 *
 * No time column of any kind, deliberately. "Updated 3h ago" describes the branch rather than
 * the debt, and a row that is going to be read either way is not made more actionable by it.
 * Age still decides the order - see askedHoursAgo - it just does not take up a column.
 */

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
 * Who was asked. Overlapped, because the question this column answers is "am I alone on this",
 * and that is a shape rather than a list of names.
 */
function ReviewerStack({ reviewers }: { reviewers: MockActor[] }) {
  const shown = reviewers.slice(0, 3);
  const rest = reviewers.length - shown.length;

  return (
    <div
      className="hidden w-[4.75rem] items-center justify-end @xl:flex"
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
 * Settled threads over total. Deliberately not a plain comment count: "5 comments" says how
 * chatty a pull request is, "2/9" says how much of it is still open, and only the second one
 * tells the author whether there is work waiting.
 */
function ThreadCount({ threads }: { threads: MockPullRequest["threads"] }) {
  if (threads.total === 0) {
    return <div className="hidden w-11 shrink-0 @sm:block" />;
  }

  const outstanding = threads.total - threads.resolved;

  return (
    <div
      className={cn(
        "hidden w-11 items-center justify-end gap-1 text-xs tabular-nums @sm:flex",
        outstanding > 0 ? "text-foreground" : "text-muted-foreground",
      )}
      title={`${threads.resolved} of ${threads.total} review threads resolved`}
    >
      <CommentIcon className="size-3.5 shrink-0" />
      {threads.resolved}/{threads.total}
    </div>
  );
}

const CHECKS = {
  success: {
    Icon: CheckCircleIcon,
    className: "text-emerald-500",
    label: "Checks passing",
  },
  failure: {
    Icon: XCircleIcon,
    className: "text-rose-500",
    label: "Checks failing",
  },
  pending: {
    Icon: ClockCircleIcon,
    className: "text-amber-500",
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

const REVIEW = {
  approved: {
    Icon: ApprovedIcon,
    className: "text-emerald-500",
    label: "Approved",
  },
  changes_requested: {
    Icon: ChangesRequestedIcon,
    className: "text-rose-500",
    label: "Changes requested",
  },
  review_required: {
    Icon: AwaitingReviewIcon,
    className: "text-muted-foreground/60",
    label: "Awaiting review",
  },
} as const;

function ReviewCell({ state }: { state: MockPullRequest["review"] }) {
  if (state === "none") {
    return (
      <span className="w-4 shrink-0 text-center text-xs text-muted-foreground/50">
        —
      </span>
    );
  }

  const { Icon, className, label } = REVIEW[state];

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
  /**
   * The review verdict and the CI result. On by default, off for pull requests waiting on the
   * reader: something asking for your review is going to be opened either way, so neither glyph
   * changes what you do next. On your own pull requests they are the difference between "ship
   * it" and "not yet".
   */
  showStatus?: boolean;
}

/**
 * One pull request, as one line.
 *
 * The title and its `author · repo #number` are the only things that wrap the reader's eye; the
 * rest is a fixed-width instrument panel on the right, so the columns line up down the whole
 * section and a row can be scanned by shape. Everything in that panel carries a `title`, because
 * an icon that needs a legend is only useful to whoever wrote it.
 */
export function PullRequestRow({
  pullRequest,
  index,
  showStatus = true,
}: PullRequestRowProps) {
  const { title, repo, number, author, isDraft, unread, reviewers, threads } =
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
        className="group flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent/60"
      >
        {/* The gutter. Always in the layout so titles start on the same pixel either way. */}
        <span
          aria-hidden="true"
          title={unread ? "New since you last looked" : undefined}
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            unread ? "bg-sky-400" : "bg-transparent",
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

        <ReviewerStack reviewers={reviewers} />
        <ThreadCount threads={threads} />
        {showStatus ? (
          <>
            <ReviewCell state={pullRequest.review} />
            <ChecksCell state={pullRequest.checks} />
          </>
        ) : null}
      </a>
    </li>
  );
}
