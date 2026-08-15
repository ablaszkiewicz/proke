import {
  NOTIFICATION_TYPES,
  Octicon,
  type NotificationTypeDescriptor,
} from "@/components/notifications/notificationTypes";
import { cn } from "@/lib/utils";
import { useState } from "react";

const CHECK =
  "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z";

/**
 * What a poke can be about. Nothing here is a control - every kind is on for every account
 * you turn on, and pretending otherwise with disabled checkboxes just looks broken. So it is a
 * list with a tick beside each, and a single preview underneath that follows the pointer.
 */
export function PokesPanel({ handle }: { handle: string }) {
  const [active, setActive] = useState<NotificationTypeDescriptor>(
    NOTIFICATION_TYPES[0]
  );

  return (
    <section className="flex flex-col rounded-xl border p-5">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">What pokes you</h2>
        <span className="text-xs text-muted-foreground">All repos · every kind</span>
      </header>

      <ul className="-mx-2 space-y-0.5">
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
                  "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                  isActive ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <Octicon
                  path={descriptor.icon}
                  className={cn(
                    "shrink-0 transition-colors",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                />
                <span className="flex-1">{descriptor.title}</span>
                <Octicon
                  path={CHECK}
                  size={12}
                  className="shrink-0 text-emerald-500/80"
                />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
          On GitHub
        </p>
        {/* Every preview is the same two-line height, so a swap is a fade and nothing else. */}
        <div
          key={active.type}
          className="animate-rise-in [--motion-duration:180ms]"
        >
          {active.preview(handle)}
        </div>
      </div>

      <p className="mt-auto pt-4 text-[10px] leading-relaxed text-muted-foreground/60">
        Every kind, in every repo, for every organisation you turn on. Choosing
        repos and kinds comes later.
      </p>
    </section>
  );
}
