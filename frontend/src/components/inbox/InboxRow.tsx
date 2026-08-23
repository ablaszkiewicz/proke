import type { InboxAuthor, InboxPullRequest } from "@/lib/api/inbox.api";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useState } from "react";
import { ENTER_TRAVEL_PX, enterTransition, EXIT_TRANSITION } from "./motion";

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
 * ## What animates
 *
 * Every row arrives. The rows in the first answer arrive in order, each one held back by
 * `enterDelay` - see cascadeDelay in motion.ts - so a pile fills section by section instead of
 * appearing as a block. Nothing is being hidden while that runs: the headings are already
 * there, and the whole cascade is over inside a second.
 *
 * A row that arrives *later* is the same animation with no delay in front of it. The page is
 * painted from a snapshot and corrected from GitHub a second or two after, so that change lands
 * under somebody already reading, and it is the one moment here where movement is telling them
 * something. `layout` means the rows around it slide rather than jump.
 *
 * `initial` only ever runs for a row that was not there before - React keeps rows that are in
 * both answers mounted, keyed on GitHub's node id - so a refresh that changes nothing animates
 * nothing.
 */
export function InboxRow({
  pullRequest,
  enterDelay,
}: {
  pullRequest: InboxPullRequest;
  /** Where this row sits in the cascade, in seconds. Zero for anything arriving on its own. */
  enterDelay: number;
}) {
  return (
    <motion.li
      // Position only. A row has no box either, and a title that wraps to two lines would
      // otherwise have its text scaled through the change rather than simply reflowing.
      layout="position"
      initial={{ opacity: 0, y: ENTER_TRAVEL_PX }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: EXIT_TRANSITION }}
      transition={enterTransition(enterDelay)}
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
