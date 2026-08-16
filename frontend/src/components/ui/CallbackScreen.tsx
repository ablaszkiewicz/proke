import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/**
 * How long a callback screen stays up, and how long the bar takes to fill. One number, because
 * they are the same fact: the bar finishing *is* the screen being done.
 *
 * A round trip that resolves in 200ms would otherwise flash a sentence nobody can read and be
 * gone - which reads as a glitch, not as speed. Two seconds is long enough to see what happened.
 */
export const CALLBACK_MINIMUM_MS = 2000;

/** Long enough for the exit fade to land before the next screen replaces this one. */
const HANDOFF_MS = 220;

/** How far apart the words arrive. Short - this is one phrase, not a list. */
const WORD_STAGGER_MS = 55;

/**
 * The whole timeline of a callback screen, in one place.
 *
 * `working` → `leaving` → `ready`. A caller navigates on `ready` and nothing else; `leaving`
 * only fades the screen out, so the handoff is one continuous motion rather than a cut.
 *
 * `done` going true early does not shorten anything: the minimum is a floor on how long the
 * screen is up, not a race against the request.
 */
export function useCallbackTimeline(done: boolean): {
  leaving: boolean;
  ready: boolean;
} {
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinimumElapsed(true), CALLBACK_MINIMUM_MS);
    return () => clearTimeout(timer);
  }, []);

  const leaving = done && minimumElapsed;

  useEffect(() => {
    if (!leaving) {
      return;
    }

    const timer = setTimeout(() => setReady(true), HANDOFF_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return { leaving, ready };
}

export interface CallbackScreenProps {
  /** What is happening, in the user's terms. A short phrase - it arrives a word at a time. */
  message: string;
  /** Fades the screen out, just before the caller navigates. */
  leaving?: boolean;
  className?: string;
}

/**
 * The screen a user waits on while a callback is spent: signing in, adding an organisation,
 * connecting Slack.
 *
 * Same wordmark as the dashboard, so arriving at `/app` afterwards reads as the same page
 * settling rather than as a second one loading. Under it, the one sentence that says which of
 * the three this is, and a bar that spends exactly as long filling as the screen spends up.
 */
export function CallbackScreen({
  message,
  leaving = false,
  className,
}: CallbackScreenProps) {
  const words = message.split(" ");

  return (
    <div
      data-state={leaving ? "leaving" : "working"}
      className={cn(
        "flex min-h-dvh flex-col items-center justify-center gap-5 p-8",
        "data-[state=leaving]:animate-fade-out",
        className
      )}
    >
      <h1 className="animate-rise-in text-3xl font-semibold tracking-tight">
        proke
      </h1>

      {/*
        A word at a time rather than the line at once. The phrase is short enough that the
        stagger reads as the sentence being spoken, and `both` fill keeps each word invisible
        through its own delay so nothing flickers before its cue.

        aria-label carries the whole phrase: to a screen reader this is one message, and the
        spans are a typographic detail it has no business hearing.
      */}
      <p
        aria-label={message}
        className="flex flex-wrap justify-center gap-x-[0.3em] text-lg text-muted-foreground"
      >
        {words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            aria-hidden="true"
            style={{ animationDelay: `${index * WORD_STAGGER_MS}ms` }}
            className="animate-word-in"
          >
            {word}
          </span>
        ))}
      </p>

      <ProgressBar pending={!leaving} />
    </div>
  );
}

/**
 * Deliberately small. A full-width bar on an otherwise empty screen reads as a page loading;
 * this is a moment passing, and it should look like one.
 *
 * The fill is exponential rather than linear - most of the distance goes early and the last
 * stretch eases in - so it feels like something being finished rather than a timer counting
 * down. It is honest about the one thing it claims: it reaches the end exactly when the screen
 * does, because both are the same duration.
 */
function ProgressBar({ pending }: { pending: boolean }) {
  return (
    // The wait pulse rides on the track, not on the fill. They are separate elements because
    // `animation` is one property: putting both on the fill would mean swapping its animation
    // at the two-second mark, which restarts it - the bar would empty and refill on the way out.
    // The pulse carries its own 2s delay, so it only ever begins once the fill has landed.
    <div
      role="progressbar"
      aria-label="Loading"
      className={cn(
        "h-[3px] w-28 overflow-hidden rounded-full bg-foreground/10",
        pending && "animate-progress-wait"
      )}
    >
      <div className="h-full w-full origin-left rounded-full bg-foreground/70 animate-progress-fill" />
    </div>
  );
}
