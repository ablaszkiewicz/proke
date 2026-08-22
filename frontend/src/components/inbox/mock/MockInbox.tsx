import type { InboxResult } from "@/lib/api/inbox.api";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { InboxPage } from "../InboxPage";
import { CACHED_RESULT, FRESH_RESULT, NO_SNAPSHOT } from "./fixtures";

/**
 * The inbox transition on a stopwatch instead of a network.
 *
 * Public, unauthenticated and never shipped anywhere near a user. It exists because the thing
 * worth getting right - waiting screen, handoff, first paint, then rows changing under somebody
 * already reading them - happens once per page load and takes about three seconds, which is a
 * terrible thing to iterate on against a real backend.
 *
 * Everything below the controls is the real code - InboxPage, its sections and its rows. Only
 * where the two results come from is faked, and only how long they take.
 */

/** A single indexed Mongo lookup over a local connection. Fast enough to feel like nothing. */
const CACHED_MS = 120;

/** What a GitHub round trip actually costs, give or take. Adjustable from the bar. */
const REFRESH_PRESETS = [800, 2500, 5000];

type Phase = "waiting" | "cached" | "refreshing" | "settled";

interface Scenario {
  key: "warm" | "cold";
  label: string;
  /** What the read answers with. A cold user has a snapshot that has never been built. */
  cached: InboxResult;
  note: string;
}

const SCENARIOS: Scenario[] = [
  {
    key: "warm",
    label: "Warm",
    cached: CACHED_RESULT,
    note: "snapshot exists · page paints in 120ms, refresh lands behind it",
  },
  {
    key: "cold",
    label: "Cold",
    cached: NO_SNAPSHOT,
    note: "no snapshot · page sits empty until GitHub answers",
  },
];

export function MockInbox() {
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [refreshMs, setRefreshMs] = useState(REFRESH_PRESETS[1]);
  const [run, setRun] = useState(0);

  const [result, setResult] = useState<InboxResult>(NO_SNAPSHOT);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshAttempted, setRefreshAttempted] = useState(false);

  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  useEffect(() => {
    clearTimers();
    setResult(NO_SNAPSHOT);
    setRefreshing(false);
    setRefreshAttempted(false);

    // The read. Chained rather than parallel, exactly as inboxLogic chains them - the refresh
    // only starts once the read has landed, so the slower answer is always the later one.
    timers.current.push(
      window.setTimeout(() => {
        setResult(scenario.cached);
        setRefreshing(true);

        timers.current.push(
          window.setTimeout(() => {
            setResult(FRESH_RESULT);
            setRefreshing(false);
            setRefreshAttempted(true);
          }, refreshMs)
        );
      }, CACHED_MS)
    );

    return clearTimers;
  }, [scenario, refreshMs, run, clearTimers]);

  const settled = result.refreshedAt !== undefined || refreshAttempted;

  const phase: Phase = !settled
    ? "waiting"
    : refreshing
      ? "refreshing"
      : refreshAttempted
        ? "settled"
        : "cached";

  return (
    <div className="min-h-dvh w-full">
      <InboxPage
        yours={result.yours}
        waitingOnYou={result.waitingOnYou}
        refreshing={refreshing}
        stale={result.stale}
        settled={settled}
        hasAnswer={result.refreshedAt !== undefined}
        githubReauthRequired={result.githubReauthRequired}
      />

      {/*
        Floating rather than taking a row of the layout, unlike the drafts gallery next door.
        That one was tuning how a page fits its viewport; this is tuning how one arrives, and
        shortening the viewport would change the thing being measured.
      */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3">
        <nav className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-black/85 px-2 py-1.5 text-xs text-neutral-400 backdrop-blur">
          <button
            type="button"
            onClick={() => setRun((n) => n + 1)}
            className="rounded-md bg-white px-2.5 py-1 font-medium text-black transition-opacity hover:opacity-90"
          >
            Replay
          </button>

          <Divider />

          {SCENARIOS.map((option) => (
            <Chip
              key={option.key}
              active={option.key === scenario.key}
              onClick={() => setScenario(option)}
            >
              {option.label}
            </Chip>
          ))}

          <Divider />

          <span className="pl-1 text-neutral-500">refresh</span>
          {REFRESH_PRESETS.map((ms) => (
            <Chip key={ms} active={ms === refreshMs} onClick={() => setRefreshMs(ms)}>
              {ms / 1000}s
            </Chip>
          ))}

          <Divider />

          <span className="tabular-nums text-neutral-500">{phase}</span>
          <span className="hidden pl-2 text-neutral-600 md:inline">
            {scenario.note}
          </span>
        </nav>
      </div>
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px bg-white/10" />;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 transition-colors",
        active ? "bg-white/15 text-white" : "hover:text-white"
      )}
    >
      {children}
    </button>
  );
}
