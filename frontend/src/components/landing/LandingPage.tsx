import { GithubLoginButton } from "@/components/auth/GithubLoginButton";
import { PokeReel } from "@/components/notifications/PokeReel";
import { POKE_PREVIEWS } from "@/components/notifications/pokePreviews";
import { Button } from "@/components/ui/button";
import { GitHubIcon } from "@/components/ui/GitHubIcon";
import { SlackIcon } from "@/components/ui/SlackIcon";
import { authLogic } from "@/lib/logics/authLogic";
import { Link } from "@tanstack/react-router";
import { useValues } from "kea";
import { useEffect, useState } from "react";

const REPO_URL = "https://github.com/ablaszkiewicz/proke";

/**
 * The public page at `/`. The signed-in app lives at `/app`, so this one never has to decide
 * which of the two it is - it only ever swaps its one button for a way back into the app.
 *
 * Deliberately one screen with nothing below the fold: the whole pitch is a sentence and a
 * picture of the thing happening, and anything a scroll could add would be padding.
 */
export function LandingPage() {
  const { isLoggedIn, loginError } = useValues(authLogic);

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      {/* A single soft light behind the hero. One flat colour everywhere else would be flat. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_32%,oklch(0.985_0_0/0.08),transparent_72%)]"
      />

      <main className="relative flex flex-1 flex-col items-center justify-center gap-7 px-6">
        <Wiring />

        <header className="flex flex-col items-center gap-5 text-center">
          <h1
            className="animate-rise-in text-6xl font-medium tracking-tight sm:text-7xl"
            style={{ animationDelay: "60ms" }}
          >
            proke
          </h1>
          <p
            className="animate-rise-in text-balance text-sm text-muted-foreground sm:text-base"
            style={{ animationDelay: "140ms" }}
          >
            GitHub notifications that actually reach you (instantly).
          </p>
        </header>

        <PokePreview />

        <div
          className="animate-rise-in flex w-full max-w-xs flex-col items-center gap-3"
          style={{ animationDelay: "300ms" }}
        >
          {isLoggedIn ? (
            <Button asChild size="lg" className="h-10 w-full rounded-md">
              <Link to="/app">Open proke</Link>
            </Button>
          ) : (
            <GithubLoginButton />
          )}

          {/* Only under the sign-in button: there is nothing to agree to on the way back in. */}
          {isLoggedIn ? null : (
            <p className="text-center text-[10px] leading-relaxed text-muted-foreground/60">
              By signing in, you agree to our Terms of Service.
            </p>
          )}

          {loginError ? (
            <p className="text-center text-xs text-destructive">{loginError}</p>
          ) : null}
        </div>
      </main>

      <footer className="relative shrink-0 pb-7 text-center text-xs text-muted-foreground/70">
        Free and open source ·{" "}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 align-middle underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          <GitHubIcon className="size-3" />
          ablaszkiewicz/proke
        </a>
      </footer>
    </div>
  );
}

/*
 * The wiring opens the page rather than following it: GitHub is there from the first frame with
 * the first poke already leaving it, and Slack scales in as the wave reaches that side. The
 * words and the card come up underneath at the same time, so it is one arrival, not two.
 */
const GITHUB_MARK_MS = 0;
const SLACK_MARK_MS = 500;
const DOT_ENTER_MS = GITHUB_MARK_MS;
const DOT_ENTER_STEP_MS = 140;
/** After the last dot has landed, plus a breath. Before it, the loop would tread on the arrival. */
const SIGNAL_START_MS = 1200;
const SIGNAL_STEP_MS = 170;

/**
 * The mark: what proke is, before a word of it is read. Two logos and the thing that moves
 * between them - the dots are the product, and the two marks are only there to say which way
 * it goes.
 */
function Wiring() {
  return (
    <div className="flex items-center gap-5" aria-hidden="true">
      <span
        className="animate-scale-in inline-flex"
        style={{ animationDelay: `${GITHUB_MARK_MS}ms` }}
      >
        <GitHubIcon className="size-11 sm:size-12" />
      </span>

      <span className="flex items-center gap-2">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className="animate-signal size-1.5 rounded-full bg-foreground"
            // Entrance, then loop - the two animations the utility declares, in that order.
            style={{
              animationDelay: `${DOT_ENTER_MS + index * DOT_ENTER_STEP_MS}ms, ${
                SIGNAL_START_MS + index * SIGNAL_STEP_MS
              }ms`,
            }}
          />
        ))}
      </span>

      <span
        className="animate-scale-in inline-flex"
        style={{ animationDelay: `${SLACK_MARK_MS}ms` }}
      >
        <SlackIcon className="size-11 sm:size-12" />
      </span>
    </div>
  );
}

/** How long one kind of poke holds the window before the reel moves to the next. */
const POKE_CYCLE_MS = 3000;

/**
 * What arrives, rendered as the Slack message it is rather than described - and all six kinds
 * of it, one at a time. The same reel the dashboard uses; there it follows the pointer, here it
 * walks the list on a timer.
 *
 * Always downwards, never back: `wrap` carries the last kind on to the first instead of winding
 * the list back up, so the only direction anything ever moves here is the one a feed moves in.
 */
function PokePreview() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStep((current) => current + 1), POKE_CYCLE_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="animate-rise-in w-full max-w-md"
      style={{ animationDelay: "220ms" }}
    >
      <PokeReel index={step % POKE_PREVIEWS.length} wrap />
    </div>
  );
}
