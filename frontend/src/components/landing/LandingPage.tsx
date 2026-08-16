import { GithubLoginButton } from "@/components/auth/GithubLoginButton";
import { Button } from "@/components/ui/button";
import { GitHubIcon } from "@/components/ui/GitHubIcon";
import { SlackIcon } from "@/components/ui/SlackIcon";
import { authLogic } from "@/lib/logics/authLogic";
import { Link } from "@tanstack/react-router";
import { useValues } from "kea";

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
      {/* A single soft light behind the hero. Pure black everywhere else would be flat. */}
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

/**
 * The mark: what proke is, before a word of it is read. Two logos and the thing that moves
 * between them - the dots are the product, and the two marks are only there to say which way
 * it goes.
 */
function Wiring() {
  return (
    <div className="animate-fade-in flex items-center gap-5" aria-hidden="true">
      <GitHubIcon className="size-11 sm:size-12" />

      <span className="flex items-center gap-2">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className="animate-signal size-1.5 rounded-full bg-foreground"
            style={{ animationDelay: `${index * 170}ms` }}
          />
        ))}
      </span>

      <SlackIcon className="size-11 sm:size-12" />
    </div>
  );
}

/**
 * What arrives, rendered as the Slack message it is rather than described. Fixed copy: it is a
 * picture of the product, not a live preview, and inventing a fake feed would suggest otherwise.
 */
function PokePreview() {
  return (
    <figure
      className="animate-rise-in w-fit max-w-full rounded-xl border bg-card/40 p-3.5 text-left"
      style={{ animationDelay: "220ms" }}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded bg-foreground text-[11px] font-semibold text-background">
          p
        </span>

        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            proke
            <span className="rounded bg-muted px-1 py-px text-[9px] font-normal uppercase tracking-wider text-muted-foreground">
              App
            </span>
          </p>
          {/*
            One line is the whole shape of a poke, so the card is sized to hold this sentence
            rather than the sentence trimmed to fit the card. Below `sm` there is no width to
            hold it in and it wraps, which beats clipping the end of it.
          */}
          <p className="text-xs leading-relaxed text-muted-foreground sm:whitespace-nowrap">
            <span className="text-foreground">@ada</span> requested your review
            on <span className="text-blue-400">Fix flaky uploads #482</span>
          </p>
          <p className="text-[10px] text-muted-foreground/60">acme/api</p>
        </div>
      </div>
    </figure>
  );
}
