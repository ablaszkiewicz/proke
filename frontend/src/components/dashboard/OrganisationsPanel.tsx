import { Button } from "@/components/ui/button";
import type { Connection } from "@/lib/api/connections.api";
import { cn } from "@/lib/utils";

export interface OrganisationsPanelProps {
  connections: Connection[];
  installUrl: string;
  loading: boolean;
  pendingIds: string[];
  actionError: string | null;
  onSubscribe: (installationId: string) => void;
  onUnsubscribe: (installationId: string) => void;
  onUninstall: (installationId: string) => void;
}

/** Gap between one row's entrance and the next. Long enough to read as a cascade, short enough
 *  that four rows are all there well under half a second. */
const STAGGER_MS = 55;

/**
 * The accounts proke can see, and the one switch that matters per account: on or off. One card,
 * rows divided by hairlines rather than boxed individually - the list is the object, not each row.
 *
 * Nothing here pops. Rows cascade in once, keyed by installation so a refetch after a toggle
 * leaves them where they are; the header count cross-fades; the add link is always in the
 * layout and merely becomes visible when there is somewhere for it to go.
 */
export function OrganisationsPanel({
  connections,
  installUrl,
  loading,
  pendingIds,
  actionError,
  onSubscribe,
  onUnsubscribe,
  onUninstall,
}: OrganisationsPanelProps) {
  const on = connections.filter((c) => c.status === "subscribed").length;
  const isInitialLoad = loading && connections.length === 0;
  const isEmpty = !loading && connections.length === 0;

  const meta = isInitialLoad
    ? "Loading…"
    : connections.length > 0
      ? `${on} of ${connections.length} on`
      : "";

  return (
    <section className="flex flex-col rounded-xl border p-5">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Organisations</h2>
        {/* Keyed on the text: a change fades the new value in rather than snapping it. */}
        <span key={meta} className="animate-fade-in text-xs text-muted-foreground">
          {meta}
        </span>
      </header>

      {connections.length > 0 ? (
        <ul className="divide-y">
          {connections.map((connection, index) => (
            <ConnectionRow
              key={connection.installationId}
              connection={connection}
              index={index}
              isPending={pendingIds.includes(connection.installationId)}
              onSubscribe={onSubscribe}
              onUnsubscribe={onUnsubscribe}
              onUninstall={onUninstall}
            />
          ))}
        </ul>
      ) : null}

      {isEmpty ? (
        <p className="animate-fade-in py-8 text-center text-xs text-muted-foreground">
          proke isn't installed anywhere you can see yet.
        </p>
      ) : null}

      {/*
        Always rendered so the footnote below never shifts; invisible until the URL is known
        (it arrives with the list), then it takes the last slot in the cascade.
      */}
      <a
        href={installUrl || undefined}
        aria-hidden={!installUrl}
        tabIndex={installUrl ? undefined : -1}
        style={{ animationDelay: `${connections.length * STAGGER_MS}ms` }}
        className={cn(
          "-ml-1 mt-2 flex w-fit items-center gap-2 rounded-md py-1.5 pr-2 pl-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
          installUrl ? "animate-rise-in" : "pointer-events-none opacity-0"
        )}
      >
        <PlusIcon className="size-3.5" />
        Add an organisation
      </a>

      {actionError ? (
        <p className="animate-fade-in mt-2 text-xs text-destructive">{actionError}</p>
      ) : null}

      <p className="mt-auto pt-4 text-[10px] leading-relaxed text-muted-foreground/60">
        GitHub only lists accounts proke is installed on. Adding an organisation
        you don't own sends its owners a request.
      </p>
    </section>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
    </svg>
  );
}

const DOT: Record<Connection["status"], string> = {
  subscribed: "bg-emerald-500",
  available: "bg-neutral-400/60 dark:bg-neutral-600",
  suspended: "bg-amber-500",
};

const STATUS_COLOR: Record<Connection["status"], string> = {
  subscribed: "text-emerald-500",
  available: "text-muted-foreground",
  suspended: "text-amber-500",
};

function statusText(connection: Connection): string {
  switch (connection.status) {
    case "subscribed":
      return connection.repositorySelection === "selected"
        ? "On · selected repos"
        : "On · all repos";
    case "available":
      return "Not on yet";
    case "suspended":
      return "Suspended on GitHub";
  }
}

function ConnectionRow({
  connection,
  index,
  isPending,
  onSubscribe,
  onUnsubscribe,
  onUninstall,
}: {
  connection: Connection;
  index: number;
  isPending: boolean;
  onSubscribe: (installationId: string) => void;
  onUnsubscribe: (installationId: string) => void;
  onUninstall: (installationId: string) => void;
}) {
  const isSubscribed = connection.status === "subscribed";
  const isSuspended = connection.status === "suspended";

  const confirmUninstall = () => {
    const scope =
      connection.accountType === "Organization"
        ? `everyone in ${connection.accountLogin}`
        : "your account";

    // Org-wide and irreversible from here - a reinstall is a fresh install, and every
    // opt-in goes with it. Worth one interruption.
    if (
      window.confirm(
        `Remove proke from ${connection.accountLogin}?\n\n` +
          `This uninstalls the GitHub App for ${scope}, not just you. ` +
          `Everyone's notifications from this account stop.`
      )
    ) {
      onUninstall(connection.installationId);
    }
  };

  return (
    <li
      style={{ animationDelay: `${index * STAGGER_MS}ms` }}
      className="group flex animate-rise-in items-center gap-3 py-2.5 first:pt-1 last:pb-1"
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", DOT[connection.status])}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {connection.accountLogin}
          {connection.accountType === "User" ? (
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              personal
            </span>
          ) : null}
        </p>
        {/* Keyed so a toggle's new state fades in rather than flipping. */}
        <p
          key={connection.status}
          className={cn(
            "animate-fade-in text-xs",
            STATUS_COLOR[connection.status]
          )}
        >
          {statusText(connection)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {/*
          Destructive and rare: there on hover, invisible otherwise. Sits *before* the toggle so
          the toggle stays flush with the card edge and nothing shifts when it appears.
        */}
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={confirmUninstall}
          title={`Remove proke from ${connection.accountLogin} entirely`}
          className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
        >
          Remove
        </Button>

        {isSuspended ? (
          <Button asChild variant="outline" size="sm">
            <a href={connection.manageUrl}>Fix on GitHub</a>
          </Button>
        ) : (
          <Button
            variant={isSubscribed ? "ghost" : "default"}
            size="sm"
            isLoading={isPending}
            onClick={() =>
              isSubscribed
                ? onUnsubscribe(connection.installationId)
                : onSubscribe(connection.installationId)
            }
          >
            {isSubscribed ? "Turn off" : "Turn on"}
          </Button>
        )}
      </div>
    </li>
  );
}
