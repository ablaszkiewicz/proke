import {
  isKeptWarm,
  sameBuildFilters,
  toBuildFilters,
  type InboxBuildFilters,
  type InboxFilters,
  type InboxWarmPin,
} from "@/lib/api/inbox.api";
import { cn } from "@/lib/utils";
import { describeBuildFilters } from "./filters";
import { DrawerHeader } from "./InboxDrawer";

/**
 * The views being kept ready, and the only place to stop keeping one.
 *
 * ## Why the list exists at all
 *
 * Because without it the only way to free a slot would be to navigate back to the exact settings
 * a view was kept under and press the switch again - which means remembering settings you chose
 * a week ago, on a page whose whole argument is that nothing should have to be remembered.
 *
 * ## Why a row is pressable
 *
 * The settings live in the address bar, so a kept view has somewhere to go. Pressing a row shows
 * it - and it arrives instantly, because it is kept ready, which is the feature explaining
 * itself better than a sentence could. The row for what is already on screen says so instead.
 *
 * ## Why only two settings are named on a row
 *
 * Because only two of them are what a kept view *is*. The rest - teams, bots, ignored authors -
 * are applied to a stored answer on the way out, so every combination of them is the same kept
 * view and naming one would be picking arbitrarily among things that are all equally true.
 * The note under the heading says this once, so no row has to.
 */
export function InboxWarmPanel({
  onClose,
  pins,
  max,
  loaded,
  filters,
  onDrop,
  onShow,
}: {
  onClose: () => void;
  pins: InboxWarmPin[];
  max: number;
  loaded: boolean;
  /** What is on screen, so the row standing for it can say so and a press can keep the rest. */
  filters: InboxFilters;
  onDrop: (filters: InboxBuildFilters) => void;
  onShow: (filters: InboxBuildFilters) => void;
}) {
  const current = toBuildFilters(filters);
  const showingIsKept = isKeptWarm(pins, current);

  return (
    <>
      <DrawerHeader
        title="Kept ready"
        note={
          // Says the two things somebody would otherwise have to discover: what keeping does,
          // and why changing the settings underneath does not make a new one.
          "Rebuilt every few minutes so they open instantly. Team, bot and ignored-author " +
          "settings are free either way, so they are not part of a kept view."
        }
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4 pt-1.5">
        {!loaded ? (
          <p className="px-2.5 py-2 text-[12px] leading-snug text-muted-foreground/80">
            Asking what you have kept…
          </p>
        ) : pins.length === 0 ? (
          <p className="px-2.5 py-2 text-[12px] leading-snug text-muted-foreground/80">
            Nothing kept yet. Press the bolt to keep the view you are looking at, and it will be
            on screen the moment you open the page.
          </p>
        ) : (
          <>
            {pins.map((pin) => (
              <WarmRow
                key={pin.key}
                pin={pin}
                showing={sameBuildFilters(pin.filters, current)}
                onDrop={() => onDrop(pin.filters)}
                onShow={() => onShow(pin.filters)}
              />
            ))}

            <p className="px-2.5 pt-2.5 text-[11px] leading-snug text-muted-foreground/70">
              {pins.length} of {max} kept
              {pins.length >= max && !showingIsKept
                ? " — remove one to keep the view you are looking at."
                : "."}
            </p>
          </>
        )}
      </div>
    </>
  );
}

/**
 * One kept view.
 *
 * Two controls side by side rather than one row with a remove button floated over it, so the
 * press targets do not overlap: showing a view and forgetting it are not adjacent intentions and
 * a mis-press between them is annoying in one direction and destructive in the other. The undo
 * covers the destructive one, and the layout tries not to need it.
 */
function WarmRow({
  pin,
  showing,
  onDrop,
  onShow,
}: {
  pin: InboxWarmPin;
  showing: boolean;
  onDrop: () => void;
  onShow: () => void;
}) {
  return (
    <div className="group flex items-center gap-1 rounded-md px-1 hover:bg-accent/40">
      <button
        type="button"
        onClick={onShow}
        disabled={showing}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded px-1.5 py-2 text-left",
          "focus-visible:outline-2 focus-visible:-outline-offset-2",
          showing ? "cursor-default" : "cursor-pointer"
        )}
      >
        <span className="w-full truncate text-[12px] leading-snug text-foreground">
          {describeBuildFilters(pin.filters)}
        </span>

        {showing ? (
          <span className="text-[10.5px] leading-none text-muted-foreground/80">
            Showing now
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={onDrop}
        aria-label={`Stop keeping ${describeBuildFilters(pin.filters)}`}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/70",
          "transition-colors hover:bg-accent hover:text-foreground",
          "focus-visible:outline-2 focus-visible:-outline-offset-2"
        )}
      >
        <svg
          viewBox="0 0 12 12"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      </button>
    </div>
  );
}
