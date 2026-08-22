import type { InboxAuthor, InboxPullRequest } from "@/lib/api/inbox.api";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useState } from "react";
import { EXIT_TRANSITION, rowTransition } from "./motion";

/** A real avatar where the network allows, initials otherwise - never a broken image. */
export function ActorAvatar({
  author,
  size = 22,
  className,
}: {
  author: InboxAuthor;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !author.avatarUrl) {
    return (
      <span
        style={{ width: size, height: size, fontSize: size * 0.42 }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium uppercase text-muted-foreground",
          className
        )}
      >
        {author.login.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      src={author.avatarUrl}
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
 * One pull request. Avatar, title, and the line that says where it lives.
 *
 * No borders, no status glyphs, no dates. Separation between rows is space, and the hierarchy
 * inside one is type size - which is the whole argument of this layout, and the reason a row
 * carries nothing that could be answered by opening it.
 *
 * A draft is told apart by the weight of its title and nothing else. It is the one distinction
 * that can be made here without adding an object to the row.
 *
 * ## Why this animates at all, having previously refused to
 *
 * The page is now painted from a snapshot and corrected from GitHub a second or two later, so
 * rows genuinely arrive while somebody is reading. Without `layout` a pull request landing at
 * the top of a section moves every row under it by forty pixels between two frames, and the line
 * you were halfway through is simply somewhere else.
 *
 * `initial` only ever runs for a row that was not there before - React keeps rows that are in
 * both answers mounted, keyed on GitHub's node id - so a refresh that changes nothing animates
 * nothing.
 */
export function InboxRow({
  pullRequest,
  index,
}: {
  pullRequest: InboxPullRequest;
  /** Position within its section, for the entrance stagger. */
  index: number;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: EXIT_TRANSITION }}
      transition={rowTransition(index)}
    >
      <a
        href={pullRequest.url}
        target="_blank"
        rel="noreferrer"
        className="group flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent"
      >
        <ActorAvatar author={pullRequest.author} size={22} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[15px] leading-snug decoration-1 underline-offset-2 group-hover:underline",
              pullRequest.isDraft ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {pullRequest.title}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {pullRequest.repositoryFullName}
            <span className="text-muted-foreground/60">
              {" "}
              #{pullRequest.number}
            </span>
            <span className="text-muted-foreground/40"> · </span>
            {pullRequest.author.login}
          </p>
        </div>
      </a>
    </motion.li>
  );
}
