import {
  NOTIFICATION_TYPES,
  Octicon,
  type NotificationTypeDescriptor,
} from "@/components/notifications/notificationTypes";
import { LockedCheckbox } from "@/components/ui/LockedCheckbox";
import { ProkeLogo } from "@/components/ui/ProkeLogo";
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import { MOCK_ORGS, MOCK_USER } from "../mock";
import {
  Brand,
  Eyebrow,
  GhostAction,
  OrgActions,
  PokeText,
  SlackMark,
  StatusDot,
  UserChip,
} from "../shared";

/**
 * Title and body are separate grid children (`contents`), so titles share row 1 and line up
 * while bodies share row 2 and centre against each other - which is what lets one horizontal
 * connector run through the middle of every list.
 */
function Stage({
  column,
  title,
  hint,
  children,
}: {
  column: "col-start-1" | "col-start-3" | "col-start-5";
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="contents">
      <div className={cn(column, "row-start-1 self-end pb-3")}>
        <Eyebrow>{title}</Eyebrow>
        <p className="mt-0.5 text-xs text-muted-foreground/70">{hint}</p>
      </div>
      <div className={cn(column, "row-start-2 flex min-h-0 flex-col gap-3")}>
        {children}
      </div>
    </section>
  );
}

/** A straight line with an arrowhead, optionally labelled. Minimal on purpose - no plumbing. */
function Connector({
  column,
  label,
}: {
  column: "col-start-2" | "col-start-4";
  label?: ReactNode;
}) {
  return (
    <div className={cn(column, "relative row-start-2 h-24 w-16")}>
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <svg
        viewBox="0 0 8 8"
        className="absolute right-0 top-1/2 size-2 -translate-y-1/2 fill-border"
        aria-hidden="true"
      >
        <path d="M0 0 L8 4 L0 8 Z" />
      </svg>
      {label ? (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-background px-1.5">
          {label}
        </div>
      ) : null}
    </div>
  );
}

function SlackWindow({ descriptor }: { descriptor: NotificationTypeDescriptor }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <SlackMark className="size-3" />
        Direct message from proke
      </div>
      <div className="flex gap-2.5 p-3">
        <ProkeLogo size={26} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium">proke</span>
            <span className="text-[10px] text-muted-foreground">now</span>
          </div>
          <p className="text-xs">
            <PokeText type={descriptor.type} />
          </p>
          <div className="mt-1.5">{descriptor.preview(MOCK_USER.login)}</div>
        </div>
      </div>
      <div className="mt-auto border-t p-3">
        <button
          type="button"
          className="w-full rounded-md border border-dashed py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          Connect Slack
        </button>
      </div>
    </div>
  );
}

/**
 * The product as a pipe: GitHub accounts on the left, the kinds of event in the middle, Slack
 * on the right. Hovering an event shows how it would land. It explains the mental model at a
 * glance - install here, filter here, arrive there - at the cost of being the least
 * conventional dashboard of the five.
 */
export function PipelineDraft() {
  const [active, setActive] = useState<NotificationTypeDescriptor>(
    NOTIFICATION_TYPES[0]
  );

  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-6 p-6">
      <header className="flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-4">
          <UserChip />
          <GhostAction>Log out</GhostAction>
        </div>
      </header>

      {/*
        Two rows: titles, then bodies. `content-center` floats the pair in the middle of the
        screen; `items-center` centres each body against the tallest one, so the connector's
        line runs through the middle of every list rather than through empty space below it.
      */}
      <div className="grid min-h-0 grid-cols-[0.9fr_auto_1.1fr_auto_1fr] grid-rows-[auto_auto] content-center items-center">
        <Stage
          column="col-start-1"
          title="Sources"
          hint="GitHub accounts proke is installed on"
        >
          <ul className="space-y-1.5">
            {MOCK_ORGS.map((org) => (
              <li
                key={org.id}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg border px-3 py-2",
                  org.status !== "subscribed" && "opacity-60"
                )}
              >
                <StatusDot status={org.status} />
                <span className="flex-1 truncate text-sm">{org.login}</span>
                <span className="text-[10px] text-muted-foreground">
                  {org.status === "subscribed"
                    ? org.scope === "all"
                      ? "all repos"
                      : `${org.repos} repos`
                    : org.status}
                </span>
                <OrgActions org={org} compact />
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="rounded-lg border border-dashed py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            + Add an organisation
          </button>
        </Stage>

        <Connector
          column="col-start-2"
          label={
            <label className="flex cursor-not-allowed items-center gap-1.5 text-[10px] text-muted-foreground">
              <LockedCheckbox className="size-3" />
              all repos
            </label>
          }
        />

        <Stage column="col-start-3" title="Events" hint="What is worth a proke — all on">
          <ul className="space-y-1.5">
            {NOTIFICATION_TYPES.map((descriptor) => {
              const isActive = descriptor.type === active.type;

              return (
                <li key={descriptor.type}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(descriptor)}
                    onFocus={() => setActive(descriptor)}
                    onClick={() => setActive(descriptor)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "border-foreground/30 bg-accent"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <LockedCheckbox />
                    <Octicon
                      path={descriptor.icon}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="flex-1 truncate">{descriptor.title}</span>
                    <span
                      className={cn(
                        "text-[10px] text-muted-foreground transition-opacity",
                        isActive ? "opacity-100" : "opacity-0"
                      )}
                    >
                      →
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Stage>

        <Connector column="col-start-4" />

        <Stage column="col-start-5" title="Delivery" hint="Where it lands">
          <SlackWindow descriptor={active} />
        </Stage>
      </div>
    </div>
  );
}
