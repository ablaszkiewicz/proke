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
  /**
   * The gear on a row. Also a plain link out to github.com, so it reports itself the same way
   * the add link does, and for the same reason: proke never sees the click.
   */
  onManageClick?: (installationId: string) => void;
}

/** Gap between one row's entrance and the next. Long enough to read as a cascade, short enough
 *  that four rows are all there well under half a second. */
const STAGGER_MS = 55;

/**
 * The accounts proke can see, and the one switch that matters per account: listening or muted.
 * One card,
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
  onManageClick,
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
              Listening to <RollingNumber value={on} max={connections.length} />{" "}
              of {connections.length}
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
              installUrl={installUrl}
              isPending={pendingIds.includes(connection.installationId)}
              onSubscribe={onSubscribe}
              onUnsubscribe={onUnsubscribe}
              onUninstall={onUninstall}
              onManageClick={onManageClick}
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75Zm-6.504 4.925.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.15l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
    </svg>
  );
}

/** Stroked rather than filled: a solid gear at this size is a smudge. */
function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
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

/**
 * Where the gear on a row goes, which is not the same page for everyone looking at it.
 *
 * An owner gets GitHub's own installation settings - the repository picker, and the only place
 * a new repo is added. A member cannot open that page at all: it is owner-only and GitHub
 * answers 404, so pointing them at it would be a dead end on the row that needs the link most.
 * They get the install flow instead, where choosing the account does not install anything -
 * GitHub turns it into a request and emails the owners.
 *
 * An unknown role takes the request path too. It means proke could not establish standing, and
 * an owner who lands in the install flow still ends up on the picker; a member sent the other
 * way would just hit the 404.
 *
 * Null on somebody else's personal account: there is nothing to configure and no one to ask.
 */
function manageTarget(
  connection: Connection,
  installUrl: string
): { href: string; label: string } | null {
  if (connection.viewerRole === "owner") {
    return {
      href: connection.manageUrl,
      label: `Manage which ${connection.accountLogin} repos proke can see on GitHub`,
    };
  }

  if (connection.accountType === "Organization" && installUrl) {
    return {
      href: installUrl,
      label: `Ask an owner of ${connection.accountLogin} to change which repos proke can see`,
    };
  }

  return null;
}

function ConnectionRow({
  connection,
  index,
  installUrl,
  isPending,
  onSubscribe,
  onUnsubscribe,
  onUninstall,
  onManageClick,
}: {
  connection: Connection;
  index: number;
  installUrl: string;
  isPending: boolean;
  onSubscribe: (installationId: string) => void;
  onUnsubscribe: (installationId: string) => void;
  onUninstall: (installationId: string) => void;
  onManageClick?: (installationId: string) => void;
}) {
  const confirm = useConfirm();
  const isSubscribed = connection.status === "subscribed";
  const isSuspended = connection.status === "suspended";
  const meta = accountMeta(connection);
  const manage = manageTarget(connection, installUrl);

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
          primary action - the icons sit next to Mute and should not read as one control. */}
      <div className="flex shrink-0 items-center gap-1">
        {/*
          Icons rather than words for both, because the row's own text is what should be read
          and two more labels on every line were louder than what they did.
          Furthest from the toggle: destructive and rare, there on hover, invisible otherwise.
          Its box is in the layout either way, so nothing shifts when it appears.
        */}
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={confirmUninstall}
          aria-label={`Remove proke from ${connection.accountLogin} entirely`}
          title={`Remove proke from ${connection.accountLogin} entirely`}
          className="size-8 px-0 text-muted-foreground opacity-0 transition-opacity has-[>svg]:px-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
        >
          <TrashIcon className="size-3.5" />
        </Button>

        {/*
          Adding repositories is the thing people come back to this page for, so unlike Remove
          it is visible without hovering - dimmed, and only as loud as the row's second line.
        */}
        {manage ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="size-8 px-0 text-muted-foreground/70 transition-colors has-[>svg]:px-0 hover:text-foreground"
          >
            <a
              href={manage.href}
              aria-label={manage.label}
              title={manage.label}
              onClick={() => onManageClick?.(connection.installationId)}
            >
              <GearIcon className="size-3.5" />
            </a>
          </Button>
        ) : null}

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
