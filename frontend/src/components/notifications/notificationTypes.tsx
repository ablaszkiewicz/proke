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
  clock:
    "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z",
  comment:
    "M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Z",
  issue:
    "M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z",
  mention:
    "M4.75 2.37a6.5 6.5 0 0 0 6.5 11.26.75.75 0 0 1 .75 1.298 8 8 0 1 1 4-6.93v.5a2.75 2.75 0 0 1-5.072 1.475A4 4 0 1 1 12 8v.5a1.25 1.25 0 0 0 2.5 0V8a6.5 6.5 0 0 0-9.75-5.63ZM10.5 8a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
  reply:
    "M6.78 1.97a.75.75 0 0 1 0 1.06L3.81 6h6.44A4.75 4.75 0 0 1 15 10.75v2.5a.75.75 0 0 1-1.5 0v-2.5a3.25 3.25 0 0 0-3.25-3.25H3.81l2.97 2.97a.749.749 0 1 1-1.06 1.06L1.47 7.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z",
  commit:
    "M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
  people:
    "M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Zm-5.5-.5a2 2 0 1 0-.001 3.999A2 2 0 0 0 5.5 3.5Z",
  tag: "M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z",
  star: "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z",
};

/** A stand-in for somebody else's avatar - a real one would mean a network request. */
export function Avatar({ className }: { className?: string }) {
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

export function Who({ children }: { children: ReactNode }) {
  return <span className="text-foreground/80">{children}</span>;
}

/**
 * The frame every preview sits in: one header line, one body line, both clipped to a single
 * line. Mock-ups of very different GitHub moments still come out the exact same height, which
 * the reel that stacks them depends on.
 */
export function Preview({
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
    type: "auto_merge_enabled",
    title: "Someone enables auto-merge on your pull request",
    short: "Auto-merge",
    icon: ICON.clock,
    // Green pill and all: this is GitHub's own auto-merge banner, which is what the person
    // reading the setting is being asked to recognise.
    preview: () => (
      <Preview
        icon={
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/15 px-1.5 py-px text-[10px] leading-none text-emerald-600 dark:text-emerald-400">
            <Octicon path={ICON.clock} />
            Auto-merge
          </span>
        }
        header={
          <>
            <Who>octocat</Who> enabled auto-merge
          </>
        }
        body="Merges automatically when all checks pass."
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
    type: "comment_reply",
    title: "Someone replies in a thread you started",
    short: "Reply",
    icon: ICON.reply,
    // The indent is the whole point: what makes this different from a PR comment is that it sits
    // under something you wrote, so the preview shows both halves rather than just the reply.
    preview: () => (
      <Preview
        icon={<Octicon path={ICON.reply} className="text-muted-foreground" />}
        header={
          <>
            <Who>octocat</Who> replied to you
          </>
        }
        body="Good catch — pushed a fix, mind taking another look?"
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
  {
    type: "team_mention",
    title: "Someone mentions a team you are in",
    short: "Team mention",
    icon: ICON.people,
    // Ignores the handle it is given: what gets named here is the team.
    preview: () => (
      <Preview
        icon={<Octicon path={ICON.comment} className="text-muted-foreground" />}
        header={
          <>
            <Who>octocat</Who> commented on <Who>#42</Who>
          </>
        }
        body={
          <>
            <Mention handle="acme/reviewers" /> any objections to this one?
          </>
        }
      />
    ),
  },
];
