import { Button } from "@/components/ui/button";
import { SlackIcon } from "@/components/ui/SlackIcon";
import type { SlackConnection } from "@/lib/api/slack.api";
import type { SlackTestState } from "@/lib/logics/slackLogic";
import { cn } from "@/lib/utils";

export interface SlackPanelProps {
  connection: SlackConnection;
  loading: boolean;
  testState: SlackTestState;
  actionError: string | null;
  onDisconnect: () => void;
  onTest: () => void;
  /**
   * Both authorize buttons leave for slack.com, so unlike Disconnect and Send a test poke there
   * is no action behind them - just a link. Optional, and supplied only by Dashboard, so the
   * drafts gallery renders the same panel without reporting design work as product use.
   */
  onConnectClick?: () => void;
  onInstallClick?: () => void;
}

type Mode = "loading" | "unconfigured" | SlackConnection["status"];

/**
 * Where the pokes actually go. A strip rather than a panel: it is one fact and one decision,
 * and giving it a column of its own would suggest there is more to it than there is.
 *
 * The two halves of connecting are deliberately separate steps. Signing in with Slack tells us
 * who someone is and needs nobody's permission; adding the app to a workspace often does, so
 * it is only ever offered once we know that workspace is actually missing it.
 */
export function SlackPanel({
  connection,
  loading,
  testState,
  actionError,
  onDisconnect,
  onTest,
  onConnectClick,
  onInstallClick,
}: SlackPanelProps) {
  const mode: Mode =
    loading && !connection.connectUrl
      ? "loading"
      : !connection.configured
        ? "unconfigured"
        : connection.status;

  // `||` rather than `??` throughout: an unknown workspace arrives as '' at least as often as
  // it arrives absent, and `??` let it through as an empty gap mid-sentence.
  const where = connection.teamName || "your workspace";
  const handle = connection.slackHandle ? `@${connection.slackHandle}` : null;
  const who = handle ?? "you";

  return (
    <section className="group flex flex-col rounded-xl border p-5 md:col-span-2">
      <div className="flex items-center gap-4">
        {/*
          Colour is the status. Nothing is connected until the whole path works, and a full
          colour Slack mark over "not connected yet" would read as if it already did.
        */}
        <SlackIcon
          className={cn(
            "size-6 shrink-0 transition-all duration-700",
            mode === "linked" ? "opacity-100" : "opacity-40 grayscale"
          )}
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Slack</p>
          {/* Keyed on the mode so a change fades rather than swapping mid-sentence. */}
          <p key={mode} className="animate-fade-in truncate text-xs text-muted-foreground">
            {mode === "loading" ? "Loading…" : null}
            {mode === "unconfigured" ? "Not set up on this server yet." : null}
            {mode === "unlinked" ? "Not connected, so prokes have nowhere to go." : null}
            {/*
              Two steps, and this is the second one - so it says so. Naming the state as
              progress rather than as a contradiction ("you're here, but proke isn't") keeps
              the reader from re-reading it to work out whether something failed.
            */}
            {mode === "workspace_missing"
              ? `${handle ? `Signed in as ${handle}` : "Signed in"}. One step left - add proke to ${where}.`
              : null}
            {mode === "linked" ? (
              <>
                Poking <span className="text-foreground">{who}</span> in {where}
              </>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {mode === "unlinked" ? (
            <Button asChild size="sm">
              <a href={connection.connectUrl || undefined} onClick={onConnectClick}>
                Connect Slack
              </a>
            </Button>
          ) : null}

          {mode === "workspace_missing" ? (
            <>
              <DisconnectButton onDisconnect={onDisconnect} />
              <Button asChild size="sm">
                <a href={connection.installUrl || undefined} onClick={onInstallClick}>
                  Add to workspace
                </a>
              </Button>
            </>
          ) : null}

          {mode === "linked" ? (
            <>
              <DisconnectButton onDisconnect={onDisconnect} />
              <Button
                variant="outline"
                size="sm"
                isLoading={testState === "sending"}
                onClick={onTest}
              >
                <span key={testState} className="animate-fade-in">
                  {testState === "sent" ? "Sent" : "Send a test proke"}
                </span>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <p className="animate-fade-in mt-2 text-xs text-destructive">{actionError}</p>
      ) : null}
    </section>
  );
}

/** Rare and undoable in one click, so it waits for a hover rather than sitting in the way. */
function DisconnectButton({ onDisconnect }: { onDisconnect: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onDisconnect}
      className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
    >
      Disconnect
    </Button>
  );
}
