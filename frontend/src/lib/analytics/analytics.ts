import posthog from "posthog-js";

import type { User } from "../api/user.api";
import type { AnalyticsEvent } from "./events";

/** The one place the prefix is written down. Every browser event gets it, without exception. */
const EVENT_PREFIX = "frontend_";

/**
 * Everything proke tells PostHog from the browser.
 *
 * Nothing here does anything without `VITE_POSTHOG_KEY`, which is the normal state locally: a
 * dev run should not be adding to the numbers, and nobody should have to remember to filter it
 * out afterwards.
 *
 * ## Why this imports the posthog singleton directly
 *
 * PostHog's own docs say not to - the library may not be initialized when a module-level import
 * runs, and calling into it then throws. That warning is about apps whose init happens inside a
 * React effect. Here `initAnalytics()` runs synchronously in main.tsx before
 * `createRoot(...).render()`, so by the time anything below can be called the library is up.
 *
 * It has to work this way, because the callers that matter are not components. authLogic,
 * connectionsLogic and slackLogic are kea logics living outside React, where `usePostHog()` is
 * not available. React components can still use the hook; this is for everything else.
 */
let initialized = false;

export function initAnalytics(): void {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY;

  if (!apiKey) {
    return;
  }

  posthog.init(apiKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,

    /*
     * Pinned to a date rather than tracking the newest, on purpose. `defaults` is how posthog-js
     * ships behaviour changes, and '2026-06-25' turns on session_recording.streamNetworkBody,
     * which records request and response bodies. proke's API traffic carries OAuth codes on the
     * way in and a session JWT on the way back out, so that one has to be an explicit decision
     * (with streamNetworkBody: false) rather than something inherited from bumping a string.
     */
    defaults: "2026-05-30",

    // Off because every meaningful control in proke captures an event by name. Autocapture on
    // top of that is a parallel stream of $autocapture events describing the same clicks in
    // terms of DOM selectors, which is strictly harder to read and breaks on a redesign.
    autocapture: false,

    // TanStack Router navigates without a page load, so pageviews have to come off history.
    capture_pageview: "history_change",

    // Anonymous visitors to the landing page are counted but get no person profile until they
    // sign in, at which point identifyUser folds their events into the real person.
    person_profiles: "identified_only",

    /*
     * The thread that ties the two halves of proke together.
     *
     * This adds X-POSTHOG-SESSION-ID and X-POSTHOG-DISTINCT-ID to requests aimed at the backend,
     * where a NestJS interceptor reads them. The payoff is that a `backend_org_subscribed` can
     * be opened straight into the session replay of the click that caused it.
     *
     * Derived from VITE_API_URL rather than configured separately so it cannot drift from the
     * host it is meant to describe: `localhost` in development, the real API host in production.
     * Hostnames only - no protocol, no path.
     */
    tracing_headers: apiHostnames(),
  });

  initialized = true;
}

/** An event about something the user did that the server has no way to observe. */
export function captureEvent(
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {}
): void {
  if (!initialized) {
    return;
  }

  posthog.capture(`${EVENT_PREFIX}${event}`, properties);
}

/**
 * Ties this browser to the person the backend already knows about.
 *
 * `user.id` is proke's own primary key - the same value every backend event is captured
 * against - so this is what makes a `frontend_slack_connect_clicked` and the
 * `backend_slack_linked` behind it land on one person rather than two.
 *
 * Called on every profile load rather than only on sign-in. identify is idempotent for an id
 * that is already current, and the alternative is tracking "have we done this yet" in a
 * reducer that a reload resets anyway.
 */
export function identifyUser(user: User): void {
  if (!initialized) {
    return;
  }

  posthog.identify(user.id, {
    github_login: user.githubLogin,
    email: user.email,
    avatar_url: user.avatarUrl,
  });
}

/**
 * Forgets who this was, on logout.
 *
 * Without it the next person to sign in on this browser inherits the last one's distinct id,
 * and PostHog merges two real people into one who appears to use proke from two GitHub accounts.
 */
export function resetUser(): void {
  if (!initialized) {
    return;
  }

  posthog.reset();
}

/**
 * The backend's hostname, for tracing_headers.
 *
 * An empty list rather than a throw when VITE_API_URL is missing or malformed. That is already
 * going to break every request the app makes, and analytics setup should not be the thing that
 * reports it - nor should it take the whole bundle down on the way.
 */
function apiHostnames(): string[] {
  try {
    return [new URL(import.meta.env.VITE_API_URL).hostname];
  } catch {
    return [];
  }
}
