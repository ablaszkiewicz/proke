import { GitHubIcon } from "@/components/ui/GitHubIcon";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { OrganisationsPanel, type OrganisationsPanelProps } from "./OrganisationsPanel";
import { PokesPanel, type PokesPanelProps } from "./PokesPanel";
import { SlackPanel, type SlackPanelProps } from "./SlackPanel";

export interface DashboardUser {
  login?: string;
  avatarUrl?: string;
  /** False while the profile is still on its way; the footer waits for it rather than guessing. */
  loaded?: boolean;
}

export interface DashboardPageProps extends OrganisationsPanelProps {
  user: DashboardUser;
  pokes: PokesPanelProps;
  slack: SlackPanelProps;
  onLogout: () => void;
  /**
   * Slot in the footer line, between who you are and the way out. A slot rather than the
   * component itself because what goes here talks to PostHog directly, and this page has to
   * keep rendering on mock data in the drafts gallery.
   */
  feedback?: ReactNode;
  className?: string;
}

/**
 * The signed-in home page. Same bones as the sign-in page - centred, quiet, one column of
 * attention - with the two things a user has: accounts on the left, what pokes them on the right.
 * Identity sits in the footer where it does not compete with either.
 *
 * Presentational: takes data and callbacks so the same page renders on the real logic and on
 * mock data in the drafts gallery.
 */
export function DashboardPage({
  user,
  pokes,
  slack,
  onLogout,
  feedback,
  className,
  ...organisations
}: DashboardPageProps) {
  const userLoaded = user.loaded ?? true;

  return (
    <div
      className={cn(
        "flex animate-fade-in flex-col items-center justify-center gap-8 p-8",
        className
      )}
    >
      <header className="flex flex-col items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">proke</h1>

        {/*
          The only way to the inbox that is not typing the URL, which is what it was until now.
          Directly under the wordmark because that is where somebody looks first on a page they
          have opened to go somewhere, and because this page is settings - the inbox is the part
          of proke anybody opens twice a day.

          A pill rather than a line of text: it is the one thing on this page to press that is
          not about configuring something, and a link at footnote weight would have gone on being
          missed. Rounded-full so it cannot read as a fourth card. Quiet at rest all the same -
          muted on a hairline, lit only under the pointer, with the arrow leaning the way it goes.
        */}
        <Link
          to="/app/inbox"
          className="group flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <InboxIcon className="size-3.5" />
          Go to inbox
          <ArrowRightIcon className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </header>

      {/*
        Two columns of what proke knows, then the one line about where it all comes out. Slack
        sits underneath both because it is downstream of both.
      */}
      <main className="grid w-full max-w-4xl gap-5 md:grid-cols-2">
        <OrganisationsPanel {...organisations} />
        <PokesPanel {...pokes} />
        <SlackPanel {...slack} />
      </main>

      {/*
        Fixed height, content faded in once the profile is known. Rendering "you" first and
        swapping to the handle would be a jump, and so would the footer appearing from nothing.
      */}
      <footer className="flex h-5 items-center justify-center text-xs text-muted-foreground">
        <div
          className={cn(
            "flex items-center gap-2 transition-opacity duration-500",
            userLoaded ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          <Avatar avatarUrl={user.avatarUrl} />
          <span>
            Signed in as{" "}
            <span className="text-foreground">
              {user.login ? `@${user.login}` : "you"}
            </span>
          </span>
          <span aria-hidden="true">·</span>
          {feedback ? (
            <>
              {feedback}
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <button
            type="button"
            onClick={onLogout}
            className="cursor-pointer transition-colors hover:text-foreground"
          >
            Log out
          </button>
        </div>
      </footer>
    </div>
  );
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M2.8 2.06A1.75 1.75 0 0 1 4.41 1h7.18c.7 0 1.333.417 1.61 1.06l2.74 6.395c.04.093.06.194.06.295v4.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25v-4.5c0-.101.02-.202.06-.295Zm1.61.44a.25.25 0 0 0-.23.152L1.887 8H4.75a.75.75 0 0 1 .6.3L6.625 10h2.75l1.275-1.7a.75.75 0 0 1 .6-.3h2.863L11.82 2.652a.25.25 0 0 0-.23-.152Zm10.09 7h-2.375l-1.275 1.7a.75.75 0 0 1-.6.3h-3.5a.75.75 0 0 1-.6-.3L4.875 9.5H1.5v3.75c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25Z" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

/** A muted disc from the first frame; the real picture fades in over it once it has loaded. */
function Avatar({ avatarUrl }: { avatarUrl?: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");

  return (
    <span className="relative inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
      {!avatarUrl || state === "failed" ? <GitHubIcon className="size-3" /> : null}
      {avatarUrl && state !== "failed" ? (
        <img
          src={avatarUrl}
          alt=""
          width={20}
          height={20}
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          className={cn(
            "absolute inset-0 size-5 transition-opacity duration-300",
            state === "loaded" ? "opacity-100" : "opacity-0"
          )}
        />
      ) : null}
    </span>
  );
}
