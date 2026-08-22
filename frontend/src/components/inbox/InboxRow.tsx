import type { InboxAuthor, InboxPullRequest } from "@/lib/api/inbox.api";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useState } from "react";
import { ENTER_TRANSITION, EXIT_TRANSITION } from "./motion";

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
 * ## What animates, and what deliberately does not
 *
 * The rows the page first paints with do not animate at all. They are the answer to "what is
 * waiting for me", and putting anything between somebody and that - a fade, a stagger, six
 * pixels of travel - is a cost paid on every single load for a flourish that is only interesting
 * the first time.
 *
 * A row that arrives *later* is different. The page is painted from a snapshot and corrected
 * from GitHub a second or two after, so that change lands under somebody already reading, and it
 * is the one moment here where movement is telling them something. Those rows fade in, and
 * `layout` means the rows around them slide rather than jump.
 *
 * `initial` only ever runs for a row that was not there before - React keeps rows that are in
 * both answers mounted, keyed on GitHub's node id - so a refresh that changes nothing animates
 * nothing.
 */
export function InboxRow({
  pullRequest,
  animateEntrance,
}: {
  pullRequest: InboxPullRequest;
  /** See InboxPage: false until the page has painted, so the first rows simply exist. */
  animateEntrance: boolean;
}) {
  return (
    <motion.li
      layout
      initial={animateEntrance ? { opacity: 0, y: -6 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: EXIT_TRANSITION }}
      transition={ENTER_TRANSITION}
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
