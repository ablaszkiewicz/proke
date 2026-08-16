import { cn } from "@/lib/utils";
import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import {
  PokeCard,
  POKE_INTRO_PREVIEWS,
  POKE_PREVIEWS,
} from "./pokePreviews";

const INTRO_COUNT = POKE_INTRO_PREVIEWS.length;
/** One lap of the real list. Row `r` and row `r + CYCLE` are the same card, which is what lets
 * a wrapping reel keep going forwards past the end and be silently put back afterwards. */
const CYCLE = POKE_PREVIEWS.length;
const ROWS = [...POKE_INTRO_PREVIEWS, ...POKE_PREVIEWS, ...POKE_PREVIEWS];
const TOTAL = ROWS.length;

/** Space between one stacked poke and the next. */
const GAP_PX = 5;
/** How much of the neighbours shows above and below the one in the window before fading out. */
const PEEK_PX = 14;

/**
 * Critically damped springs: leave quickly, land softly, never overshoot. Retargeting keeps the
 * velocity, so three rows in quick succession read as one scroll that carries on, not three
 * separate hops. The intro uses a softer one - a long unhurried glide down through the run-up -
 * and because neither ever overshoots, once the reel is on the real list nothing can carry it
 * back up above row zero.
 */
const STIFFNESS = 150;
const INTRO_STIFFNESS = 50;
/** Integrate in slices no longer than this so a dropped frame cannot bend the curve. */
const MAX_SLICE_S = 1 / 120;
const REST_DISTANCE = 0.001;
const REST_VELOCITY = 0.01;

/**
 * Blur grows with speed the way a camera would see it - pixels travelled during the exposure -
 * and only along the axis of travel, which is what separates motion blur from being out of focus.
 */
const BLUR_PER_PX_PER_S = 0.0035;
const MAX_BLUR_PX = 5;
const MIN_BLUR_PX = 0.05;

const MASK = `linear-gradient(to bottom, transparent, #000 ${PEEK_PX}px, #000 calc(100% - ${PEEK_PX}px), transparent)`;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Every poke stacked in a column behind a window one poke tall, with a run of others above the
 * real ones. Position is a row index: 0 to 5 are the six kinds, negative is the run-up. The reel
 * starts at the top of that run-up and, as soon as the page is up, flies down through it to row
 * 0. From then on choosing a row does not swap the card, it scrolls the column to it - up for
 * rows above, down for rows below, through whatever lies between - with the neighbours peeking
 * in at the edges. Blur follows velocity, so it smears when it is flying and is pin-sharp the
 * moment it settles.
 *
 * Who picks the row is the caller's business: the landing page runs a timer, the dashboard hands
 * it whichever kind the pointer is on. Position is a spring integrated on requestAnimationFrame
 * and written straight to the DOM as a custom property, so React never renders a frame of it.
 * Reduced motion skips the intro and jumps between rows.
 *
 * `wrap` is for the timer case: rows only ever advance, so the last kind goes *on* to the first
 * rather than winding five rows back up the list. It works because a second copy of the list is
 * stacked underneath - the reel scrolls forwards into it and is rebased by one lap once it has
 * settled, which is invisible because the card it lands on is the same card either way. A
 * pointer-driven reel leaves it off: there, following the pointer back up the list is the honest
 * move.
 *
 * Width comes from the parent - the card fills it - so a wide container gets the whole sentence
 * and a narrow one ellipsises it.
 */
export function PokeReel({
  index,
  wrap = false,
  className,
}: {
  index: number;
  wrap?: boolean;
  className?: string;
}) {
  const filterId = `poke-reel-blur-${useId().replace(/[^\w-]/g, "")}`;
  const windowRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const blurRef = useRef<SVGFEGaussianBlurElement>(null);
  const motion = useRef({
    x: prefersReducedMotion() ? index : -INTRO_COUNT,
    v: 0,
    target: index,
    /** The row the reel was mounted on; leaving it is what counts as the caller taking over. */
    mountIndex: index,
    /** Set once anything has moved the reel - the intro or the caller - and never unset. */
    started: false,
    frame: 0,
    last: 0,
    stepPx: 64,
  });

  // Where the reel starts, before anything has moved.
  useLayoutEffect(() => {
    windowRef.current?.style.setProperty("--reel-index", String(motion.current.x));
  }, []);

  /** Get the reel moving towards its target; a no-op while it already is. */
  const run = useCallback(() => {
    const m = motion.current;
    // In flight: the running loop reads the new target on its next frame and bends towards it.
    if (m.frame) return;

    const win = windowRef.current;
    const viewport = viewportRef.current;
    const blur = blurRef.current;
    if (!win || !viewport) return;

    /**
     * Back one lap, once the reel is at rest on the duplicate copy. Position and target move
     * together and the card underneath is identical, so nothing about the frame changes - it
     * just leaves room to keep going forwards on the next tick of the timer.
     */
    const rebase = () => {
      if (wrap && m.x >= CYCLE) {
        m.x -= CYCLE;
        m.target -= CYCLE;
      }
    };

    const paint = () => {
      win.style.setProperty("--reel-index", m.x.toFixed(4));
      const amount = Math.min(MAX_BLUR_PX, Math.abs(m.v) * m.stepPx * BLUR_PER_PX_PER_S);
      if (amount >= MIN_BLUR_PX && blur) {
        blur.setStdDeviation(0, amount);
        viewport.style.filter = `url(#${filterId})`;
      } else {
        viewport.style.filter = "";
      }
    };

    if (prefersReducedMotion()) {
      m.x = m.target;
      m.v = 0;
      rebase();
      paint();
      return;
    }
    if (Math.abs(m.x - m.target) < REST_DISTANCE) return;

    m.stepPx = (sizerRef.current?.offsetHeight ?? 58) + GAP_PX;
    m.last = performance.now();

    const tick = (now: number) => {
      let dt = Math.min(0.064, Math.max(0, (now - m.last) / 1000));
      m.last = now;
      while (dt > 0) {
        const h = Math.min(MAX_SLICE_S, dt);
        dt -= h;
        // Soft while still up in the run-up, snappy once on the real list.
        const k = m.x < 0 ? INTRO_STIFFNESS : STIFFNESS;
        m.v += (-k * (m.x - m.target) - 2 * Math.sqrt(k) * m.v) * h;
        m.x += m.v * h;
      }

      const settled =
        Math.abs(m.x - m.target) < REST_DISTANCE && Math.abs(m.v) < REST_VELOCITY;
      if (settled) {
        m.x = m.target;
        m.v = 0;
        rebase();
      }
      paint();
      m.frame = settled ? 0 : requestAnimationFrame(tick);
    };
    m.frame = requestAnimationFrame(tick);
  }, [filterId, wrap]);

  // The intro: the moment we are mounted, fly down onto whichever row is current. Not guarded on
  // `started` on purpose - StrictMode's rehearsal unmount cancels the frame, and this running
  // again is what picks the glide back up.
  useEffect(() => {
    motion.current.started = true;
    run();
  }, [run]);

  // The caller: any row but the one we mounted on gets the reel moving, intro or no intro.
  useEffect(() => {
    const m = motion.current;
    // Wrapping: a row at or behind the current target is the next lap round, so aim past the
    // end of the list rather than back up it. The loop is belt and braces - the rebase on settle
    // means one lap is always enough.
    let next = index;
    while (wrap && next < m.target - 0.5) {
      next += CYCLE;
    }

    m.target = next;
    if (m.started || index !== m.mountIndex) {
      m.started = true;
      run();
    }
  }, [index, wrap, run]);

  useEffect(() => {
    const m = motion.current;
    return () => {
      cancelAnimationFrame(m.frame);
      m.frame = 0;
    };
  }, []);

  return (
    <div
      ref={windowRef}
      aria-hidden="true"
      className={cn("relative overflow-hidden", className)}
      style={{
        paddingBlock: PEEK_PX,
        maskImage: MASK,
        WebkitMaskImage: MASK,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
      }}
    >
      {/* An invisible card holds the window open to exactly one poke, plus the peeks. */}
      <div ref={sizerRef} className="invisible">
        <PokeCard preview={POKE_PREVIEWS[0]} />
      </div>

      {/* Blurred as a whole while moving; the mask on the window keeps the fade itself crisp. */}
      <div ref={viewportRef} className="absolute inset-0">
        <div
          className="absolute inset-x-0"
          style={{
            top: PEEK_PX,
            // Slot k sits at row k - INTRO_COUNT; row 0 is the first real poke.
            transform: `translateY(calc((var(--reel-index, 0) + ${INTRO_COUNT}) * -100% / ${TOTAL}))`,
          }}
        >
          {ROWS.map((preview, slot) => (
            <div key={slot} style={{ paddingBottom: GAP_PX }}>
              <PokeCard preview={preview} />
            </div>
          ))}
        </div>
      </div>

      {/* Vertical-only Gaussian: stdDeviation "0 y". Driven per frame from the spring's speed. */}
      <svg aria-hidden="true" focusable="false" className="absolute size-0">
        <filter
          id={filterId}
          x="0"
          y="-25%"
          width="100%"
          height="150%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur ref={blurRef} in="SourceGraphic" stdDeviation="0 0" edgeMode="none" />
        </filter>
      </svg>
    </div>
  );
}
