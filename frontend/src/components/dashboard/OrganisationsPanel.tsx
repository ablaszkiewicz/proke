import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { RollingNumber } from "@/components/ui/RollingNumber";
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
  /**
   * Adding an organisation leaves for github.com, so unlike every other control here there is
   * no action behind it - just a link. Optional, and supplied only by Dashboard, so the drafts
   * gallery renders the same panel without reporting design work as product use.
   */
  onAddClick?: () => void;
}

/** Gap between one row's entrance and the next. Long enough to read as a cascade, short enough
 *  that four rows are all there well under half a second. */
const STAGGER_MS = 55;

/**
 * The accounts proke can see, and the one switch that matters per account: on or off. One card,
 * rows divided by hairlines rather than boxed individually - the list is the object, not each row.
 *
 * Nothing here pops. Rows cascade in once, keyed by installation so a refetch after a toggle
 * leaves them where they are; the header count rolls to its new value; the add link is always
 * in the layout and merely becomes visible when there is somewhere for it to go.
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
  onAddClick,
}: OrganisationsPanelProps) {
  const on = connections.filter((c) => c.status === "subscribed").length;
  const isInitialLoad = loading && connections.length === 0;
  const isEmpty = !loading && connections.length === 0;

  const mode = isInitialLoad
    ? "loading"
    : connections.length > 0
      ? "counts"
      : "empty";

  return (
    <section className="flex flex-col rounded-xl border p-5">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Organisations</h2>
        {/*
          Keyed on the mode, not on the text: arriving at a count fades in, but a count that
          then changes has to roll. Re-keying on every value would flicker the whole line for
          the sake of one digit.
        */}
        <span key={mode} className="animate-fade-in text-xs text-muted-foreground">
          {mode === "loading" ? "Loading…" : null}
          {mode === "counts" ? (
            <>
              <RollingNumber value={on} max={connections.length} /> of{" "}
              {connections.length} on
            </>
          ) : null}
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
        onClick={onAddClick}
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

/** How many names the hover list shows before it starts counting the rest. */
const NAMED_REPOS = 8;

/**
 * What kind of account this is, and what the signed-in user is to it.
 *
 * "personal" alone was actively misleading on somebody else's account: a colleague who shares
 * one repository out of their own profile produced a row reading exactly like your own profile.
 * The role is the half that distinguishes them, so it is the half that has to be there.
 */
function accountMeta(connection: Connection): string | null {
  const parts = [
    connection.accountType === "User" ? "personal" : null,
    connection.viewerRole,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The second line of a row: what proke is doing with this account, and how much of it this
 * user can actually see.
 */
function StatusLine({ connection }: { connection: Connection }) {
  if (connection.status === "suspended") {
    // Nothing is being delivered, so how many repositories it would cover is not the point.
    return <>Suspended on GitHub</>;
  }

  const prefix = connection.status === "subscribed" ? "Listening" : "Muted";

  if (connection.repositoryCount === undefined) {
    // GitHub could not be asked. Falling back to what the installation says about itself is
    // the wording this row carried before it could say anything sharper.
    return (
      <>
        {prefix} ·{" "}
        {connection.repositorySelection === "selected"
          ? "selected repos"
          : "all repos"}
      </>
    );
  }

  return (
    <>
      {prefix} · <RepositoryCount connection={connection} />
    </>
  );
}

/**
 * How many repositories *this user* reaches through the installation, and - on hover or focus -
 * which ones.
 *
 * The count comes from the server rather than from the names below it: a two-hundred-repository
 * org sends the first hundred, and a list saying "100" under a heading saying "212" would be
 * the sort of quiet wrongness nobody reports.
 */
function RepositoryCount({ connection }: { connection: Connection }) {
  const count = connection.repositoryCount ?? 0;
  const named = (connection.repositories ?? []).slice(0, NAMED_REPOS);
  const unnamed = count - named.length;

  const label =
    count === 0
      ? "no repos you can see"
      : `${count} ${count === 1 ? "repo" : "repos"}`;

  if (named.length === 0) {
    return <>{label}</>;
  }

  const listId = `repos-${connection.installationId}`;

  return (
    <span className="group/repos relative inline-block">
      {/*
        Focusable so the list is reachable without a pointer, described by it so a screen reader
        gets the names rather than a floating fragment, and dotted rather than solid so it reads
        as "there is more here" instead of as a link that goes somewhere.
      */}
      <span
        tabIndex={0}
        aria-describedby={listId}
        className="cursor-default rounded-sm underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {label}
      </span>

      {/*
        Above the trigger, so the last row in the list opens into the card rather than off the
        bottom of it. pointer-events-none keeps it from swallowing the hover it depends on.
      */}
      <span
        id={listId}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 w-max max-w-56 rounded-md border bg-popover p-2 text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover/repos:opacity-100 group-focus-within/repos:opacity-100"
      >
        <span className="mb-1 block text-[10px] text-muted-foreground">
          Repos you can reach
        </span>
        {named.map((repository) => (
          <span
            key={repository.repositoryId}
            className="block truncate text-[11px] leading-relaxed"
          >
            {shortName(repository.fullName, connection.accountLogin)}
          </span>
        ))}
        {unnamed > 0 ? (
          <span className="mt-1 block text-[10px] text-muted-foreground">
            +{unnamed} more
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * `acme-corp/api` under a row already headed `acme-corp` is the account name eight times over.
 * Anything not owned by this account keeps its prefix, because there the owner is the news.
 */
function shortName(fullName: string, accountLogin: string): string {
  const prefix = `${accountLogin}/`;

  return fullName.toLowerCase().startsWith(prefix.toLowerCase())
    ? fullName.slice(prefix.length)
    : fullName;
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
  const confirm = useConfirm();
  const isSubscribed = connection.status === "subscribed";
  const isSuspended = connection.status === "suspended";
  const meta = accountMeta(connection);

  const confirmUninstall = async () => {
    const isOrganisation = connection.accountType === "Organization";

    // Org-wide and irreversible from here - a reinstall is a fresh install, and every
    // opt-in goes with it. Worth one interruption.
    const confirmed = await confirm({
      title: `Remove proke from ${connection.accountLogin}?`,
      description: isOrganisation ? (
        <>
          This uninstalls the GitHub App for{" "}
          <strong className="font-medium text-foreground">
            everyone in {connection.accountLogin}
          </strong>
          , not just you. Everyone's notifications from this account stop, and
          turning it back on means a fresh install.
        </>
      ) : (
        <>
          This uninstalls the GitHub App from your account. Your notifications
          from it stop, and turning it back on means a fresh install.
        </>
      ),
      confirmLabel: "Remove",
      destructive: true,
    });

    if (confirmed) {
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
        className={cn(
          // Eased, because a listen/mute now lands the moment it is clicked and a colour
          // snapping across the row would be the one hard edge left in it.
          "size-1.5 shrink-0 rounded-full transition-colors duration-300",
          DOT[connection.status]
        )}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {connection.accountLogin}
          {meta ? (
            <span className="ml-1.5 text-[10px] text-muted-foreground">
              {meta}
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
          <StatusLine connection={connection} />
        </p>
      </div>

      {/* gap-1, the same breathing room Slack's panel leaves between Disconnect and its
          primary action - Remove sits next to Mute and should not read as one control. */}
      <div className="flex shrink-0 items-center gap-1">
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
            {isSubscribed ? "Mute" : "Listen"}
          </Button>
        )}
      </div>
    </li>
  );
}
