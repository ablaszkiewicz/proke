import { NOTIFICATION_TYPES, Octicon } from "@/components/notifications/notificationTypes";
import { PokeReel } from "@/components/notifications/PokeReel";
import { cn } from "@/lib/utils";
import { useState } from "react";

const CHECK =
  "M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z";

/**
 * What a poke can be about. Nothing here is a control - every kind is on for every account
 * you listen to, and pretending otherwise with disabled checkboxes just looks broken. So it is a
 * list with a tick beside each, and a window underneath onto the Slack message that kind
 * produces, which scrolls to whichever row the pointer is on - and plays itself in on arrival.
 */
export function PokesPanel() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section className="flex flex-col rounded-xl border p-5">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">What prokes you</h2>
        <span className="text-xs text-muted-foreground">All repos · every kind</span>
      </header>

      <ul className="-mx-2 space-y-0.5">
        {NOTIFICATION_TYPES.map((descriptor, index) => {
          const isActive = index === activeIndex;

          return (
            <li key={descriptor.type}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
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

      {/*
        The poke itself, as Slack will show it. The window's own top fade is the gap above it,
        so it needs no margin of its own - and no label, because a Slack message that says who
        did what is not a thing anybody needs told what it is.
      */}
      <PokeReel index={activeIndex} className="mt-4" />

      <p className="mt-auto pt-4 text-[10px] leading-relaxed text-muted-foreground/60">
        Every kind, in every repo, for every organisation you listen to. Choosing
        repos and kinds comes later.
      </p>
    </section>
  );
}
