import { NOTIFICATION_TYPES } from "@/components/notifications/notificationTypes";
import { LockedCheckbox } from "@/components/ui/LockedCheckbox";
import { cn } from "@/lib/utils";
import { MOCK_ORGS, MOCK_USER, statusText } from "../mock";
import {
  Brand,
  Eyebrow,
  GhostAction,
  OrgActions,
  SlackChip,
  StatusDot,
  UserChip,
} from "../shared";

/**
 * Two panes. Accounts on the left as a list, kinds on the right as a grid of cards. The most
 * conventional of the five - a settings page that happens to fit on a screen.
 */
export function SplitDraft() {
  const on = MOCK_ORGS.filter((org) => org.status === "subscribed").length;

  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-6 p-6">
      <header className="flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-4">
          <SlackChip />
          <UserChip />
          <GhostAction>Log out</GhostAction>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[minmax(280px,1fr)_2fr] gap-6">
        <section className="flex min-h-0 flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <Eyebrow>Organisations</Eyebrow>
            <span className="text-xs text-muted-foreground">
              {on} of {MOCK_ORGS.length} on
            </span>
          </div>

          <ul className="space-y-1.5">
            {MOCK_ORGS.map((org) => (
              <li
                key={org.id}
                className="group flex items-center gap-3 rounded-lg border px-3 py-2"
              >
                <StatusDot status={org.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {org.login}
                    {org.type === "User" ? (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        personal
                      </span>
                    ) : null}
                  </p>
                  <p
                    className={cn(
                      "text-xs",
                      org.status === "subscribed"
                        ? "text-emerald-500"
                        : org.status === "suspended"
                          ? "text-amber-500"
                          : "text-muted-foreground"
                    )}
                  >
                    {statusText(org)}
                  </p>
                </div>
                <OrgActions org={org} />
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="rounded-lg border border-dashed py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            + Add an organisation
          </button>

          <p className="mt-auto text-[10px] text-muted-foreground/60">
            GitHub only shows accounts proke is installed on. Installing on an
            org you don't own sends a request to its owners.
          </p>
        </section>

        <section className="flex min-h-0 flex-col gap-3">
          <div className="flex items-center justify-between">
            <Eyebrow>What pokes you</Eyebrow>
            <label className="flex cursor-not-allowed items-center gap-2 text-xs text-muted-foreground">
              <LockedCheckbox className="size-3.5" />
              All repos
            </label>
          </div>

          <ul className="grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-3">
            {NOTIFICATION_TYPES.map((descriptor) => (
              <li
                key={descriptor.type}
                className="flex min-h-0 flex-col justify-center gap-2.5 overflow-hidden rounded-lg border p-3"
              >
                <label className="flex cursor-not-allowed items-center gap-2 text-sm">
                  <LockedCheckbox />
                  {descriptor.title}
                </label>
                {descriptor.preview(MOCK_USER.login)}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
