import { cn } from "@/lib/utils";
import { ActorAvatar } from "../PullRequestRow";
import type { MockPullRequest } from "../mock";
import { mineIn, reviewsIn } from "../sections";

/**
 * Variant: no piles at all, and the row is a sentence.
 *
 * Every other variant here makes you find the section first and the pull request second. This
 * one merges both columns into a single queue in urgency order and puts the *reason* in words,
 * on the theory that "cat-ph is blocked on your review" is a thing you can act on and
 * "Your team · 3" is a thing you have to interpret.
 *
 * Worth trying because it is the only shape that scales down to a phone unchanged, and because
 * it forces the ranking to be explicit rather than implied by which column something landed in.
 */

interface StreamItem {
  pullRequest: MockPullRequest;
  /** The coloured spine. Four kinds, so the eye can still group without headings. */
  tone: "blocked" | "reply" | "ready" | "idle";
  /** The bit in front, which names whoever the row is about. */
  subject: string;
  /** The rest of the sentence. */
  predicate: string;
}

function stream(): StreamItem[] {
  const items: StreamItem[] = [];

  for (const review of reviewsIn("team")) {
    items.push({
      pullRequest: review,
      tone: "blocked",
      subject: review.author.login,
      predicate: "is blocked on your review",
    });
  }
  for (const mine of mineIn("unresolved-comments")) {
    items.push({
      pullRequest: mine,
      tone: "reply",
      subject: "Your reviewers",
      predicate: "are waiting on a reply from you",
    });
  }
  for (const mine of mineIn("ready-to-merge")) {
    items.push({
      pullRequest: mine,
      tone: "ready",
      subject: "Approved and green",
      predicate: "— nothing is stopping this merging",
    });
  }
  for (const review of reviewsIn("others")) {
    items.push({
      pullRequest: review,
      tone: "blocked",
      subject: review.author.login,
      predicate: "asked for your review",
    });
  }
  for (const mine of mineIn("waiting-for-reviewers")) {
    items.push({
      pullRequest: mine,
      tone: "idle",
      subject: "Nobody has reviewed this",
      predicate:
        mine.reviewers.length === 0 ? "— you have not asked anyone yet" : "yet",
    });
  }
  for (const review of reviewsIn("bots")) {
    items.push({
      pullRequest: review,
      tone: "idle",
      subject: review.author.login,
      predicate: "opened a routine change and named you",
    });
  }
  for (const mine of mineIn("drafts")) {
    items.push({
      pullRequest: mine,
      tone: "idle",
      subject: "Still a draft",
      predicate: "— asking nothing of anyone",
    });
  }

  return items;
}

const TONE: Record<StreamItem["tone"], { spine: string; subject: string }> = {
  blocked: { spine: "bg-[#f85149]", subject: "text-foreground" },
  reply: { spine: "bg-[#d29922]", subject: "text-foreground" },
  ready: { spine: "bg-[#3fb950]", subject: "text-foreground" },
  idle: { spine: "bg-muted-foreground/25", subject: "text-muted-foreground" },
};

function Row({ item, index }: { item: StreamItem; index: number }) {
  const { pullRequest: pr } = item;
  const tone = TONE[item.tone];

  return (
    <li
      style={{ animationDelay: `${Math.min(index, 12) * 26}ms` }}
      className="animate-rise-in"
    >
      <a
        href={`https://github.com/${pr.repo}/pull/${pr.number}`}
        target="_blank"
        rel="noreferrer"
        className="group flex items-start gap-3 border-b border-border/60 py-3 pl-0 pr-4 transition-colors hover:bg-accent/50"
      >
        <span
          aria-hidden="true"
          className={cn("w-[3px] self-stretch", tone.spine)}
        />
        <ActorAvatar actor={pr.author} size={24} className="mt-0.5 ml-1" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted-foreground">
            <span className={cn("font-medium", tone.subject)}>
              {item.subject}
            </span>{" "}
            {item.predicate}
          </p>
          <p className="mt-0.5 truncate text-sm text-foreground group-hover:underline">
            {pr.title}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground/70">
            {pr.repo} #{pr.number}
          </p>
        </div>
      </a>
    </li>
  );
}

export function StreamInbox() {
  const items = stream();

  return (
    <div className="theme-slate min-h-full w-full bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 pb-16">
        <header className="sticky top-0 z-10 -mx-5 mb-1 border-b border-rule bg-background/95 px-5 py-4 backdrop-blur">
          <h1 className="text-lg font-semibold tracking-tight">
            {items.length} things want you
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Most blocking first. Both your pull requests and other people's, in
            one queue.
          </p>
        </header>

        <ul>
          {items.map((item, index) => (
            <Row key={item.pullRequest.id} item={item} index={index} />
          ))}
        </ul>
      </div>
    </div>
  );
}
