import type { InboxPullRequest, InboxResult } from "@/lib/api/inbox.api";

/**
 * Two answers to the same question, a few minutes apart.
 *
 * The point of having both is that the difference between them is visible: the fresh one has
 * two rows the cached one did not, one row has been approved since, and one has gone away
 * entirely. Loading a cached answer and then replacing it with an identical one would show
 * nothing about how the second arrival reads.
 */

function actor(login: string) {
  return { login, avatarUrl: `https://github.com/${login}.png?size=64` };
}

function pr(
  id: string,
  title: string,
  repo: string,
  number: number,
  login: string,
  isDraft = false
): InboxPullRequest {
  return {
    id,
    number,
    title,
    url: `https://github.com/${repo}/pull/${number}`,
    isDraft,
    repositoryId: repo,
    repositoryFullName: repo,
    author: actor(login),
  };
}

const MINE = {
  webpack: pr(
    "m1",
    "feat(webpack): add event release mode with native debug ids",
    "PostHog/posthog-js",
    4563,
    "ablaszkiewicz"
  ),
  flags: pr(
    "m2",
    "fix(flags): stop double-counting local evaluation calls",
    "PostHog/posthog",
    86980,
    "ablaszkiewicz"
  ),
  symbolicate: pr(
    "m3",
    "feat(error-tracking): symbolicate stack traces on ingest",
    "PostHog/posthog",
    87012,
    "ablaszkiewicz"
  ),
  chunking: pr(
    "m4",
    "refactor(replay): move snapshot chunking into rust",
    "PostHog/posthog",
    86844,
    "ablaszkiewicz"
  ),
  inbox: pr(
    "m5",
    "feat(inbox): pending review page behind a flag",
    "ablaszkiewicz/proke",
    34,
    "ablaszkiewicz"
  ),
  spike: pr(
    "m6",
    "spike(signals): scout dedupe via scratchpad memory",
    "PostHog/posthog",
    87104,
    "ablaszkiewicz",
    true
  ),
};

const THEIRS = {
  android: pr(
    "r1",
    "feat(server): opt-in uncaught exception capture",
    "PostHog/posthog-android",
    671,
    "cat-ph"
  ),
  severity: pr(
    "r2",
    "fix(error-tracking): query issues by severity",
    "PostHog/posthog",
    86409,
    "hpouillot"
  ),
  reactNative: pr(
    "r3",
    "feat(react-native): record automatic exception steps",
    "PostHog/posthog-js",
    4573,
    "jakesciotto"
  ),
  sourcemaps: pr(
    "r4",
    "chore(browser): stop publishing dist source maps to npm",
    "PostHog/posthog-js",
    4520,
    "veksa"
  ),
  deps: pr(
    "r5",
    "chore(deps): update posthoganalytics to 7.41.0",
    "PostHog/posthog",
    87088,
    "posthog-js-upgrader"
  ),
  docs: pr(
    "r6",
    "docs(cli): Document POSTHOG_CLI_DOTENV_FILE environment variable",
    "PostHog/posthog.com",
    18578,
    "inkeep"
  ),
};

/** What the snapshot held. A few minutes out of date, and the page paints from this. */
export const CACHED_RESULT: InboxResult = {
  refreshedAt: new Date().toISOString(),
  stale: false,
  githubReauthRequired: false,
  yours: [
    { key: "approved", pullRequests: [MINE.webpack] },
    { key: "unresolved-comments", pullRequests: [MINE.symbolicate, MINE.chunking] },
    { key: "waiting-for-reviewers", pullRequests: [MINE.inbox] },
    { key: "drafts", pullRequests: [MINE.spike] },
  ],
  waitingOnYou: [
    { key: "team", pullRequests: [THEIRS.severity, THEIRS.android] },
    { key: "others", pullRequests: [THEIRS.sourcemaps] },
    { key: "bots", pullRequests: [THEIRS.deps] },
  ],
};

/**
 * What GitHub actually says. Against the cached answer: `flags` is newly approved, `reactNative`
 * and `docs` have arrived, and `chunking` has been merged out from under it.
 */
export const FRESH_RESULT: InboxResult = {
  refreshedAt: new Date().toISOString(),
  stale: false,
  githubReauthRequired: false,
  yours: [
    { key: "approved", pullRequests: [MINE.webpack, MINE.flags] },
    { key: "unresolved-comments", pullRequests: [MINE.symbolicate] },
    { key: "waiting-for-reviewers", pullRequests: [MINE.inbox] },
    { key: "drafts", pullRequests: [MINE.spike] },
  ],
  waitingOnYou: [
    {
      key: "team",
      pullRequests: [THEIRS.severity, THEIRS.android, THEIRS.reactNative],
    },
    { key: "others", pullRequests: [THEIRS.sourcemaps] },
    { key: "bots", pullRequests: [THEIRS.deps, THEIRS.docs] },
  ],
};

/** A user whose snapshot has never been built. The read answers, and answers nothing. */
export const NO_SNAPSHOT: InboxResult = {
  stale: false,
  githubReauthRequired: false,
  yours: [],
  waitingOnYou: [],
};
