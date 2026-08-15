import {
  NOTIFICATION_TYPES,
  Octicon,
} from "@/components/notifications/notificationTypes";
import { LockedCheckbox } from "@/components/ui/LockedCheckbox";
import type { NotificationType } from "@/lib/api/connections.api";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { MOCK_ORGS, MOCK_USER } from "../mock";
import {
  Brand,
  GhostAction,
  OrgActions,
  SlackChip,
  StatusDot,
  UserChip,
} from "../shared";

/**
 * One table: accounts down, kinds across, a tick in every cell. The whole "who pokes me about
 * what" question on a single grid - and the shape a per-org, per-repo picker would take later,
 * since every cell is already a switch waiting to be unlocked.
 *
 * Previews live in a strip below and follow the hovered column, so the table stays dense.
 */
export function MatrixDraft() {
  const [selected, setSelected] = useState<NotificationType>(
    NOTIFICATION_TYPES[0].type
  );
  const descriptor =
    NOTIFICATION_TYPES.find((d) => d.type === selected) ?? NOTIFICATION_TYPES[0];

  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-5 p-6">
      <header className="flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-4">
          <SlackChip />
          <UserChip />
          <GhostAction>Log out</GhostAction>
        </div>
      </header>

      {/* Centred as a block: a table that fills the screen would just be a tall empty box. */}
      <div className="flex min-h-0 flex-col justify-center gap-5">
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Organisation</th>
              <th className="px-3 py-2.5 text-left font-medium">Repos</th>
              {NOTIFICATION_TYPES.map((d) => (
                <th key={d.type} className="px-1 py-1.5 font-medium">
                  <button
                    type="button"
                    onMouseEnter={() => setSelected(d.type)}
                    onFocus={() => setSelected(d.type)}
                    onClick={() => setSelected(d.type)}
                    className={cn(
                      "mx-auto flex flex-col items-center gap-1 rounded-md px-2 py-1.5 transition-colors",
                      selected === d.type
                        ? "bg-accent text-foreground"
                        : "hover:text-foreground"
                    )}
                  >
                    <Octicon path={d.icon} />
                    <span className="text-[10px] whitespace-nowrap">{d.short}</span>
                  </button>
                </th>
              ))}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {MOCK_ORGS.map((org) => {
              const isOn = org.status === "subscribed";

              return (
                <tr
                  key={org.id}
                  className="group border-b transition-colors last:border-b-0 hover:bg-accent/30"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <StatusDot status={org.status} />
                      <span className={cn(!isOn && "text-muted-foreground")}>
                        {org.login}
                      </span>
                      {org.type === "User" ? (
                        <span className="text-[10px] text-muted-foreground">
                          personal
                        </span>
                      ) : null}
                      {org.status === "suspended" ? (
                        <span className="text-[10px] text-amber-500">suspended</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {isOn
                      ? org.scope === "all"
                        ? "All"
                        : `${org.repos} selected`
                      : "—"}
                  </td>
                  {NOTIFICATION_TYPES.map((d) => (
                    <td
                      key={d.type}
                      className={cn(
                        "px-1 py-2.5 text-center",
                        selected === d.type && "bg-accent/30"
                      )}
                    >
                      {isOn ? (
                        <LockedCheckbox className="align-middle" />
                      ) : (
                        <span className="text-muted-foreground/40">·</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <OrgActions org={org} />
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={NOTIFICATION_TYPES.length + 3} className="px-4 py-2">
                <button
                  type="button"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  + Add an organisation
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer className="grid grid-cols-[minmax(0,28rem)_1fr] items-start gap-8 rounded-lg border p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Octicon path={descriptor.icon} className="text-muted-foreground" />
            {descriptor.title}
          </div>
          {descriptor.preview(MOCK_USER.login)}
        </div>
        <div className="space-y-2 pt-0.5 text-[10px] leading-relaxed text-muted-foreground/70">
          <label className="flex cursor-not-allowed items-center gap-2 text-xs text-muted-foreground">
            <LockedCheckbox className="size-3.5" />
            All repos, every kind — locked for now
          </label>
          <p>
            Hover a column to see the poke it produces. Each cell becomes a real
            switch when the repo picker lands.
          </p>
        </div>
      </footer>
      </div>
    </div>
  );
}
