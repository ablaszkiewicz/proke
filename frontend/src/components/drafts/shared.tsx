import { GitHubIcon } from "@/components/ui/GitHubIcon";
import { ProkeLogo } from "@/components/ui/ProkeLogo";
import type { NotificationType } from "@/lib/api/connections.api";
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import { MOCK_SLACK, MOCK_USER, type MockOrg, type OrgStatus } from "./mock";

/** Logo + wordmark. Every draft has one; keeping it here keeps them the same size. */
export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ProkeLogo size={22} />
      <span className="text-sm font-semibold tracking-tight">proke</span>
    </div>
  );
}

/** The real avatar when the network allows, initials otherwise - never a broken image. */
export function Avatar({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        style={{ width: size, height: size }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-muted",
          className
        )}
      >
        <GitHubIcon className="size-1/2" />
      </span>
    );
  }

  return (
    <img
      src={MOCK_USER.avatarUrl}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-full", className)}
    />
  );
}

export function UserChip({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      <Avatar size={24} />
      <span>@{MOCK_USER.login}</span>
    </div>
  );
}

const DOT: Record<OrgStatus, string> = {
  subscribed: "bg-emerald-500",
  available: "bg-neutral-400/60 dark:bg-neutral-600",
  suspended: "bg-amber-500",
};

export function StatusDot({
  status,
  className,
}: {
  status: OrgStatus;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-1.5 rounded-full", DOT[status], className)}
    />
  );
}

/** Slack is where pokes will land; every draft reserves a spot for it. */
export function SlackChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <SlackMark className="size-3" />
      {MOCK_SLACK.connected ? "Slack · connected" : "Slack · not connected"}
    </span>
  );
}

export function SlackMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M5.04 15.16a2.52 2.52 0 1 1-2.52-2.52h2.52v2.52Zm1.27 0a2.52 2.52 0 0 1 5.04 0v6.32a2.52 2.52 0 1 1-5.04 0v-6.32ZM8.83 5.04a2.52 2.52 0 1 1 2.52-2.52v2.52H8.83Zm0 1.27a2.52 2.52 0 0 1 0 5.04H2.52a2.52 2.52 0 1 1 0-5.04h6.31Zm10.13 2.52a2.52 2.52 0 1 1 2.52 2.52h-2.52V8.83Zm-1.27 0a2.52 2.52 0 0 1-5.04 0V2.52a2.52 2.52 0 1 1 5.04 0v6.31Zm-2.52 10.13a2.52 2.52 0 1 1-2.52 2.52v-2.52h2.52Zm0-1.27a2.52 2.52 0 0 1 0-5.04h6.31a2.52 2.52 0 1 1 0 5.04h-6.31Z" />
    </svg>
  );
}

/** A tiny "section" label. Same everywhere so drafts differ in layout, not typography. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  );
}

/** Mock buttons: look like the real ones, do nothing. */
export function GhostAction({
  children,
  className,
  emphasis = false,
}: {
  children: ReactNode;
  className?: string;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => event.preventDefault()}
      className={cn(
        "rounded-md px-2 py-1 text-xs whitespace-nowrap transition-colors",
        emphasis
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

/**
 * The per-account controls, same in every draft. `Remove` only appears on hover of a `group`
 * parent - it is the destructive one and does not need to be in your face on every row.
 */
export function OrgActions({
  org,
  compact = false,
}: {
  org: MockOrg;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {org.status === "suspended" ? (
        <GhostAction>Fix on GitHub</GhostAction>
      ) : (
        <GhostAction emphasis={org.status === "available"}>
          {org.status === "subscribed" ? "Turn off" : "Turn on"}
        </GhostAction>
      )}
      {!compact ? (
        <GhostAction className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive">
          Remove
        </GhostAction>
      ) : null}
    </div>
  );
}

function Ref({ children }: { children: ReactNode }) {
  return <span className="text-foreground">{children}</span>;
}

function Who({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

/** The sentence a poke would open with in Slack, per kind. */
const POKE_TEXT: Record<NotificationType, ReactNode> = {
  review_requested: (
    <>
      <Who>octocat</Who> requested your review on <Ref>cryptly-dev/api#42</Ref>
    </>
  ),
  review_submitted: (
    <>
      <Who>octocat</Who> approved <Ref>cryptly-dev/api#42</Ref>
    </>
  ),
  pull_request_merged: (
    <>
      Your pull request <Ref>cryptly-dev/api#42</Ref> was merged
    </>
  ),
  pull_request_comment: (
    <>
      <Who>octocat</Who> commented on your pull request{" "}
      <Ref>cryptly-dev/api#42</Ref>
    </>
  ),
  pull_request_mention: (
    <>
      <Who>octocat</Who> mentioned you on <Ref>cryptly-dev/api#42</Ref>
    </>
  ),
  issue_mention: (
    <>
      <Who>octocat</Who> mentioned you on <Ref>logdash-io/core#7</Ref>
    </>
  ),
};

export function PokeText({
  type,
  className,
}: {
  type: NotificationType;
  className?: string;
}) {
  return (
    <span className={cn("text-muted-foreground", className)}>{POKE_TEXT[type]}</span>
  );
}
