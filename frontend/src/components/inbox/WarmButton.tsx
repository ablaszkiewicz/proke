import { cn } from "@/lib/utils";

/**
 * Keeping the view on screen ready, and a way into the list of the ones that are.
 *
 * ## Why it is one control with two halves rather than two buttons
 *
 * Because this page had exactly one piece of chrome in its header and the argument for that is
 * still good. The two things here - keep this one, show me the others - are the same subject, so
 * a split control says so and costs one slot instead of two. A gear beside it would have been
 * worse than an extra button: this page has no gear, so the first one would be read as account
 * settings by everybody who has ever used software.
 *
 * The count does the labelling. "2/3" says what the feature is about and how much of it is used
 * without a tooltip, and it is the only thing on the page that could tell somebody they are at
 * capacity before they press something.
 *
 * ## Why it is disabled at capacity rather than allowed to fail
 *
 * It is not, quite: at capacity it stops toggling and opens the list instead. A control that
 * refuses tells you no; one that takes you to the thing you would have to change anyway is the
 * same answer with the next step attached. The server still refuses a fourth - this is the
 * courtesy, not the guard.
 */
export function WarmButton({
  on,
  loaded,
  count,
  max,
  full,
  listOpen,
  onToggle,
  onOpenList,
}: {
  on: boolean;
  /**
   * Whether the list has been read yet.
   *
   * Until it has, the switch is drawn as neither on nor off. Off and not-known-yet look
   * identical and mean opposite things, and lighting up a beat later is a brief lie about
   * somebody's own setting.
   */
  loaded: boolean;
  count: number;
  max: number;
  full: boolean;
  listOpen: boolean;
  onToggle: () => void;
  onOpenList: () => void;
}) {
  // At capacity and this view is not one of them: pressing cannot do what it says, so it does
  // the useful thing instead.
  const redirects = full && !on;

  return (
    <div
      className={cn(
        "flex items-center rounded-lg transition-colors",
        on ? "bg-accent" : "hover:bg-accent/60"
      )}
    >
      <button
        type="button"
        onClick={redirects ? onOpenList : onToggle}
        aria-pressed={loaded ? on : undefined}
        aria-label={
          !loaded
            ? "Keep this view ready"
            : redirects
              ? `Keeping ${max} views ready already. Show the list.`
              : on
                ? "Stop keeping this view ready"
                : "Keep this view ready"
        }
        title={
          redirects
            ? `Already keeping ${max} views ready — remove one first`
            : on
              ? "Kept ready — rebuilt every few minutes"
              : "Keep this view ready"
        }
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-l-lg pl-2 pr-1.5 transition-colors",
          on
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
          redirects && "opacity-60"
        )}
      >
        <BoltIcon className="size-[15px]" filled={loaded && on} />

        {/*
          Only once the list has been read. A count of nought that turns into two is a worse
          first frame than no count at all, and this is the only number in the header.
        */}
        {loaded ? (
          <span className="text-[11px] tabular-nums leading-none">
            {count}/{max}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={onOpenList}
        aria-expanded={listOpen}
        aria-label="Views kept ready"
        className={cn(
          "flex h-8 items-center rounded-r-lg pl-0.5 pr-1.5 transition-colors",
          listOpen
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <svg
          viewBox="0 0 12 12"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>
    </div>
  );
}

/**
 * A bolt rather than a flame.
 *
 * Both are available metaphors for "warm" and only one of them is about the thing the reader
 * gets. A flame says hot, which on a list of pull requests reads as busy or trending; a bolt
 * says instant, which is the entire promise. Filled when it is on, so the state survives being
 * looked at rather than depending on a background tint.
 */
function BoltIcon({
  className,
  filled,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
    </svg>
  );
}
