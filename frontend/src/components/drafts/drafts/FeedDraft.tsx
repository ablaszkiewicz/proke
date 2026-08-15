import { NOTIFICATION_TYPES } from "@/components/notifications/notificationTypes";
import { LockedCheckbox } from "@/components/ui/LockedCheckbox";
import { ProkeLogo } from "@/components/ui/ProkeLogo";
import { cn } from "@/lib/utils";
import { MOCK_ORGS, MOCK_USER } from "../mock";
import {
  Brand,
  Eyebrow,
  GhostAction,
  PokeText,
  SlackChip,
  StatusDot,
  UserChip,
} from "../shared";

/**
 * Show, don't list. A messaging-app frame: accounts sit in a sidebar like channels, and the
 * main pane is the feed of pokes you would actually get - one message per kind, each with its
 * GitHub preview as the unfurl. The settings *are* the demo.
 */
export function FeedDraft() {
  return (
    <div className="grid h-full grid-cols-[240px_1fr]">
      <aside className="flex min-h-0 flex-col gap-6 border-r p-4">
        <Brand />

        <div>
          <Eyebrow className="mb-2 px-2">Organisations</Eyebrow>
          <ul className="space-y-0.5">
            {MOCK_ORGS.map((org) => (
              <li
                key={org.id}
                className="group flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                <StatusDot status={org.status} />
                <span
                  className={cn(
                    "flex-1 truncate",
                    org.status !== "subscribed" && "text-muted-foreground"
                  )}
                >
                  {org.login}
                </span>
                <span className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  {org.status === "subscribed"
                    ? "Turn off"
                    : org.status === "available"
                      ? "Turn on"
                      : "Fix"}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-1 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            + Add an organisation
          </button>
        </div>

        <div>
          <Eyebrow className="mb-2 px-2">Repos</Eyebrow>
          <label className="flex cursor-not-allowed items-center gap-2 px-2 text-sm">
            <LockedCheckbox />
            All repos
          </label>
          <p className="mt-1 px-2 text-[10px] text-muted-foreground/60">
            Picking individual repos is coming.
          </p>
        </div>

        <div className="mt-auto space-y-3 border-t pt-3">
          <SlackChip />
          <div className="flex items-center justify-between">
            <UserChip />
            <GhostAction>Log out</GhostAction>
          </div>
        </div>
      </aside>

      <main className="flex min-h-0 flex-col">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <p className="text-sm font-medium"># pokes</p>
            <p className="text-xs text-muted-foreground">
              Six kinds, all on. This is what lands in Slack.
            </p>
          </div>
          <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
            preview
          </span>
        </div>

        {/*
          Slack's compact mode: sender and text on one line, unfurl beneath. Anchored to the
          bottom like a real channel - the newest poke is the one nearest the input.
        */}
        <ol className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-y-auto px-5 py-3">
          {NOTIFICATION_TYPES.map((descriptor, index) => (
            <li key={descriptor.type} className="flex gap-3 py-1">
              <ProkeLogo size={26} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">proke</span>
                  <span className="rounded bg-muted px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                    app
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    9:4{index}
                  </span>
                  <PokeText type={descriptor.type} />
                </p>
                <div className="mt-1 max-w-md">
                  {descriptor.preview(MOCK_USER.login)}
                </div>
              </div>
              <label className="flex shrink-0 cursor-not-allowed items-center gap-2 self-start pt-0.5 text-xs text-muted-foreground">
                {descriptor.short}
                <LockedCheckbox className="size-3.5" />
              </label>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
