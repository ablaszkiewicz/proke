import { GitHubIcon } from "@/components/ui/GitHubIcon";
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import { OrganisationsPanel, type OrganisationsPanelProps } from "./OrganisationsPanel";
import { PokesPanel } from "./PokesPanel";
import { SlackPanel, type SlackPanelProps } from "./SlackPanel";

export interface DashboardUser {
  login?: string;
  avatarUrl?: string;
  /** False while the profile is still on its way; the footer waits for it rather than guessing. */
  loaded?: boolean;
}

export interface DashboardPageProps extends OrganisationsPanelProps {
  user: DashboardUser;
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
      <header className="flex flex-col items-center">
        <h1 className="text-3xl font-semibold tracking-tight">proke</h1>
      </header>

      {/*
        Two columns of what proke knows, then the one line about where it all comes out. Slack
        sits underneath both because it is downstream of both.
      */}
      <main className="grid w-full max-w-4xl gap-5 md:grid-cols-2">
        <OrganisationsPanel {...organisations} />
        <PokesPanel />
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
