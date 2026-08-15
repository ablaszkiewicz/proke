import { NOTIFICATION_TYPES } from "@/components/notifications/notificationTypes";
import { LockedCheckbox } from "@/components/ui/LockedCheckbox";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { MOCK_ORGS, MOCK_USER, statusText } from "../mock";
import {
  Avatar,
  Brand,
  Eyebrow,
  GhostAction,
  OrgActions,
  SlackChip,
  StatusDot,
} from "../shared";

function Tile({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card/60 p-4",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * A mosaic of tiles on a fixed 6x3 grid. Nothing is a "section" - identity, accounts, the repo
 * lock and each kind are all just tiles of different sizes, which is what lets it read as one
 * surface rather than a form.
 */
export function BentoDraft() {
  return (
    <div className="flex h-full p-5">
      {/* Capped and centred: tiles that scale with the window turn hollow on a big screen. */}
      <div className="m-auto grid h-full max-h-[660px] w-full max-w-7xl grid-cols-6 grid-rows-3 gap-3">
        <Tile className="col-span-2 justify-between">
          <div className="flex items-start justify-between">
            <Brand />
            <GhostAction>Log out</GhostAction>
          </div>
          <div className="flex items-center gap-3">
            <Avatar size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">@{MOCK_USER.login}</p>
              <SlackChip />
            </div>
          </div>
        </Tile>

        <Tile className="justify-between">
          <Eyebrow>Repos</Eyebrow>
          <div>
            <label className="flex cursor-not-allowed items-center gap-2 text-sm">
              <LockedCheckbox />
              All repos
            </label>
            <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground/70">
              Everywhere proke is installed. Picking individual repos is coming.
            </p>
          </div>
        </Tile>

        <Tile className="col-span-3 gap-2">
          <div className="flex items-center justify-between">
            <Eyebrow>Organisations</Eyebrow>
            <GhostAction>+ Add</GhostAction>
          </div>
          <ul className="grid min-h-0 flex-1 grid-cols-2 gap-2">
            {MOCK_ORGS.map((org) => (
              <li
                key={org.id}
                className="group flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5"
              >
                <StatusDot status={org.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">{org.login}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {statusText(org)}
                  </p>
                </div>
                <OrgActions org={org} compact />
              </li>
            ))}
          </ul>
        </Tile>

        {NOTIFICATION_TYPES.map((descriptor) => (
          <Tile key={descriptor.type} className="col-span-2 gap-2">
            <label className="flex cursor-not-allowed items-center gap-2 text-sm">
              <LockedCheckbox />
              {descriptor.title}
            </label>
            <div className="mt-auto">{descriptor.preview(MOCK_USER.login)}</div>
          </Tile>
        ))}
      </div>
    </div>
  );
}
