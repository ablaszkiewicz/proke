import type { NotificationType } from "@/lib/api/connections.api";
import type { ReactNode } from "react";

/**
 * The user-facing half of the backend's NotificationType. Copy and preview live here; whether a
 * type is on lives in the subscription. Adding a type to the backend without adding it here
 * means a poke nobody was told to expect, so the two lists are meant to be kept level.
 */
export interface NotificationTypeDescriptor {
  type: NotificationType;
  title: string;
  /** Two or three words for places too tight for the title - table headers, nodes, chips. */
  short: string;
  /** Octicon path, for the same tight places. */
  icon: string;
  /** A miniature of the thing on GitHub that causes the poke. */
  preview: (handle: string) => ReactNode;
}

export function Octicon({
  path,
  className,
  size = 14,
}: {
  path: string;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

export const ICON = {
  eye: "M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2Zm0 2a2 2 0 1 0 0 8 2 2 0 0 0 0-8Z",
  check:
    "M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.75.75 0 0 0-1.06-1.06L6.75 9.19 5.28 7.72a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0Z",
  merge:
    "M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z",
  comment:
    "M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Z",
  issue:
    "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
  mention:
    "M4.75 2.37a6.5 6.5 0 0 0 6.5 11.26.75.75 0 0 1 .75 1.298 8 8 0 1 1 4-6.93v.5a2.75 2.75 0 0 1-5.072 1.475A4 4 0 1 1 12 8v.5a1.25 1.25 0 0 0 2.5 0V8a6.5 6.5 0 0 0-9.75-5.63ZM10.5 8a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
};

/** A stand-in for somebody else's avatar - a real one would mean a network request. */
function Avatar({ className }: { className?: string }) {
  return (
    <span
      className={`size-4 shrink-0 rounded-full bg-gradient-to-br from-neutral-400 to-neutral-600 ${className ?? ""}`}
    />
  );
}

function Mention({ handle }: { handle: string }) {
  return (
    <span className="rounded bg-blue-500/15 px-1 font-medium text-blue-600 dark:text-blue-400">
      @{handle}
    </span>
  );
}

function Who({ children }: { children: ReactNode }) {
  return <span className="text-foreground/80">{children}</span>;
}

/**
 * The frame every preview sits in: one header line, one body line, both clipped to a single
 * line. Six mock-ups of very different GitHub moments still come out the exact same height,
 * so swapping between them never moves anything around them.
 */
function Preview({
  icon,
  header,
  badge,
  body,
}: {
  icon: ReactNode;
  header: ReactNode;
  badge?: ReactNode;
  body: ReactNode;
}) {
  return (
    <div className="rounded-md border bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="min-w-0 flex-1 truncate">{header}</span>
        {badge}
      </div>
      <p className="mt-1 truncate text-foreground/80">{body}</p>
    </div>
  );
}

export const NOTIFICATION_TYPES: NotificationTypeDescriptor[] = [
  {
    type: "review_requested",
    title: "Someone requests your review",
    short: "Review request",
    icon: ICON.eye,
    preview: () => (
      <Preview
        icon={<Avatar />}
        header={
          <>
            <Who>octocat</Who> requested your review
          </>
        }
        badge={
          // leading-none: with the frame's relaxed line-height this pill would be the tallest
          // thing in the row and push this one preview 2px taller than the other five.
          <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-500/40 px-1.5 py-px text-[10px] leading-none text-amber-600 dark:text-amber-400">
            Review required
          </span>
        }
        body="Retry webhook deliveries with backoff #42"
      />
    ),
  },
  {
    type: "review_submitted",
    title: "Someone reviews your pull request",
    short: "Review",
    icon: ICON.check,
    preview: () => (
      <Preview
        icon={<Octicon path={ICON.check} className="text-emerald-500" />}
        header={
          <>
            <Who>octocat</Who> approved these changes
          </>
        }
        body="Nice — one nit inline, otherwise good to go."
      />
    ),
  },
  {
    type: "pull_request_merged",
    title: "Your pull request is merged",
    short: "Merged",
    icon: ICON.merge,
    preview: () => (
      <Preview
        icon={
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-purple-500/15 px-1.5 py-px text-[10px] leading-none text-purple-600 dark:text-purple-400">
            <Octicon path={ICON.merge} />
            Merged
          </span>
        }
        header={
          <>
            <Who>octocat</Who> merged 3 commits into{" "}
            <span className="font-mono text-[10px]">main</span>
          </>
        }
        body="Retry webhook deliveries with backoff #42"
      />
    ),
  },
  {
    type: "pull_request_comment",
    title: "Someone comments on your pull request",
    short: "PR comment",
    icon: ICON.comment,
    preview: () => (
      <Preview
        icon={<Avatar />}
        header={
          <>
            <Who>octocat</Who> left a comment
          </>
        }
        body="Looks good — one thought about the retry loop."
      />
    ),
  },
  {
    type: "pull_request_mention",
    title: "Someone mentions you on a pull request",
    short: "PR mention",
    icon: ICON.mention,
    preview: (handle) => (
      <Preview
        icon={<Octicon path={ICON.comment} className="text-muted-foreground" />}
        header={
          <>
            <Who>octocat</Who> commented on <Who>#42</Who>
          </>
        }
        body={
          <>
            <Mention handle={handle} /> could you take a look at this one?
          </>
        }
      />
    ),
  },
  {
    type: "issue_mention",
    title: "Someone mentions you on an issue",
    short: "Issue mention",
    icon: ICON.issue,
    preview: (handle) => (
      <Preview
        icon={<Octicon path={ICON.issue} className="text-emerald-500" />}
        header={<Who>Webhook deliveries are slow</Who>}
        body={
          <>
            cc <Mention handle={handle} /> — think this is the same bug.
          </>
        }
      />
    ),
  },
];
