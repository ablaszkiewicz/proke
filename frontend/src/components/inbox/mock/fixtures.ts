import type {
  InboxPullRequest,
  InboxResult,
  InboxSectionKey,
} from "@/lib/api/inbox.api";

/**
 * Two answers to the same question, a few minutes apart.
 *
 * Long enough to overflow a column, because the thing being tuned here is what a list feels like
 * when it does not fit - the fade at its edges, the scrollbar arriving under the pointer, and a
 * refresh landing while somebody is halfway down it.
 *
 * The point of having both answers is that the difference between them is visible: rows arrive,
 * one is merged away, and a pull request crosses from one section to another.
 */

type Row = [
  id: string,
  title: string,
  repo: string,
  number: number,
  login: string,
  isDraft?: boolean,
];

function make([id, title, repo, number, login, isDraft]: Row): InboxPullRequest {
  return {
    id,
    number,
    title,
    url: `https://github.com/${repo}/pull/${number}`,
    isDraft: Boolean(isDraft),
    repositoryId: repo,
    repositoryFullName: repo,
    author: { login, avatarUrl: `https://github.com/${login}.png?size=64` },
  };
}

const ME = "ablaszkiewicz";

const MINE: Record<string, InboxPullRequest> = Object.fromEntries(
  (
    [
      ["m1", "feat(webpack): add event release mode with native debug ids", "PostHog/posthog-js", 4563, ME],
      ["m2", "fix(flags): stop double-counting local evaluation calls", "PostHog/posthog", 86980, ME],
      ["m3", "chore(ci): cache mongodb-memory-server binaries between runs", "PostHog/posthog", 86741, ME],
      ["m4", "fix(cli): read POSTHOG_CLI_DOTENV_FILE before the default", "PostHog/posthog", 86502, ME],
      ["m5", "feat(error-tracking): symbolicate stack traces on ingest", "PostHog/posthog", 87012, ME],
      ["m6", "refactor(replay): move snapshot chunking into rust", "PostHog/posthog", 86844, ME],
      ["m7", "fix(surveys): stop re-showing a survey after a soft navigation", "PostHog/posthog-js", 4498, ME],
      ["m8", "perf(hogql): push property filters into the prewhere clause", "PostHog/posthog", 86233, ME],
      ["m9", "fix(batch-exports): retry S3 multipart uploads on 503", "PostHog/posthog", 86119, ME],
      ["m10", "chore(deps): move wrangler to devDependencies", "ablaszkiewicz/proke", 41, ME],
      ["m11", "feat(inbox): pending review page behind a flag", "ablaszkiewicz/proke", 34, ME],
      ["m12", "refactor: move deploy config under infrastructure/", "ablaszkiewicz/proke", 31, ME],
      ["m13", "feat(webhooks): drop bot chatter before it reaches routing", "ablaszkiewicz/proke", 29, ME],
      ["m14", "fix(slack): stop presenting a revoked bot token on every poke", "ablaszkiewicz/proke", 27, ME],
      ["m15", "spike(signals): scout dedupe via scratchpad memory", "PostHog/posthog", 87104, ME, true],
      ["m16", "wip: rate-limit accounting for the review inbox", "ablaszkiewicz/proke", 36, ME, true],
      ["m17", "wip(replay): vision scanner for rage-click clusters", "PostHog/posthog", 87211, ME, true],
      ["m18", "spike: teammate detection without the teams endpoint", "ablaszkiewicz/proke", 44, ME, true],
    ] as Row[]
  ).map((row) => [row[0], make(row)])
);

const THEIRS: Record<string, InboxPullRequest> = Object.fromEntries(
  (
    [
      ["r1", "feat(server): opt-in uncaught exception capture", "PostHog/posthog-android", 671, "cat-ph"],
      ["r2", "fix(error-tracking): query issues by severity", "PostHog/posthog", 86409, "hpouillot"],
      ["r3", "feat(react-native): record automatic exception steps", "PostHog/posthog-js", 4573, "jakesciotto"],
      ["r4", "chore(et): simplify exception card state", "PostHog/posthog", 79057, "hpouillot"],
      ["r5", "fix(error-tracking): preselect recent issue candidates", "PostHog/posthog", 78375, "hpouillot"],
      ["r6", "feat(error-tracking): link issues to existing external issues", "PostHog/posthog", 72334, "cat-ph"],
      ["r7", "fix(android): flush the queue before the process is killed", "PostHog/posthog-android", 702, "marandaneto"],
      ["r8", "chore(browser): stop publishing dist source maps to npm", "PostHog/posthog-js", 4520, "veksa"],
      ["r9", "feat(wizard-tools): publish_handoff creates the notebook", "PostHog/wizard", 1047, "gewenyu99"],
      ["r10", "fix(web-analytics): treat a null pathname as the root", "PostHog/posthog", 85990, "pauldambra"],
      ["r11", "feat(replay): mask inputs by default on new projects", "PostHog/posthog-js", 4611, "benjackwhite"],
      ["r12", "chore(deps): update posthoganalytics to 7.41.0", "PostHog/posthog", 87088, "posthog-js-upgrader"],
      ["r13", "chore(deps): Update posthog-js-lite to 4.10.4", "PostHog/posthog", 87099, "posthog-js-upgrader"],
      ["r14", "chore(deps): Update posthog-react-native to 4.63.5", "PostHog/posthog", 87009, "posthog-js-upgrader"],
      ["r15", "chore(deps): bump ruff from 0.6.1 to 0.7.0", "PostHog/posthog", 86877, "posthog-js-upgrader"],
      ["r16", "docs(cli): Document POSTHOG_CLI_DOTENV_FILE environment variable", "PostHog/posthog.com", 18578, "inkeep"],
      ["r17", "docs(error-tracking): document automatic assignee adoption", "PostHog/posthog.com", 18679, "inkeep"],
      ["r18", "docs(replay): note the new default masking behaviour", "PostHog/posthog.com", 18744, "inkeep"],
      ["r19", "chore(deps): bump vite from 7.1.2 to 7.3.6", "PostHog/posthog-js", 4630, "posthog-js-upgrader"],
      ["r20", "docs(sdk): regenerate the Python reference", "PostHog/posthog.com", 18801, "inkeep"],
    ] as Row[]
  ).map((row) => [row[0], make(row)])
);

function sections(
  source: Record<string, InboxPullRequest>,
  spec: [InboxSectionKey, string[]][]
) {
  return spec.map(([key, ids]) => ({
    key,
    pullRequests: ids.map((id) => source[id]),
  }));
}

/** What the snapshot held. A few minutes out of date, and the page paints from this. */
export const CACHED_RESULT: InboxResult = {
  refreshedAt: new Date().toISOString(),
  stale: false,
  githubReauthRequired: false,
  yours: sections(MINE, [
    ["approved", ["m1", "m3", "m4"]],
    ["unresolved-comments", ["m5", "m6", "m7", "m8", "m9"]],
    ["waiting-for-reviewers", ["m2", "m10", "m11", "m12", "m13", "m14"]],
    ["drafts", ["m15", "m16", "m17", "m18"]],
  ]),
  waitingOnYou: sections(THEIRS, [
    ["team", ["r2", "r1", "r4", "r5", "r6"]],
    ["others", ["r8", "r9", "r10"]],
    ["bots", ["r12", "r13", "r14", "r16", "r17"]],
  ]),
};

/**
 * What GitHub actually says.
 *
 * Against the cached answer: `m2` has been approved and crosses sections, `m6` was merged and is
 * gone, and five rows have arrived across both columns - two of them into the middle of a list
 * somebody may well be reading.
 */
export const FRESH_RESULT: InboxResult = {
  refreshedAt: new Date().toISOString(),
  stale: false,
  githubReauthRequired: false,
  yours: sections(MINE, [
    ["approved", ["m1", "m2", "m3", "m4"]],
    ["unresolved-comments", ["m5", "m7", "m8", "m9"]],
    ["waiting-for-reviewers", ["m10", "m11", "m12", "m13", "m14"]],
    ["drafts", ["m15", "m16", "m17", "m18"]],
  ]),
  waitingOnYou: sections(THEIRS, [
    ["team", ["r2", "r1", "r7", "r4", "r5", "r6", "r3"]],
    ["others", ["r8", "r9", "r10", "r11"]],
    ["bots", ["r12", "r13", "r14", "r15", "r16", "r17", "r18", "r19", "r20"]],
  ]),
};

/** A user whose snapshot has never been built. The read answers, and answers nothing. */
export const NO_SNAPSHOT: InboxResult = {
  stale: false,
  githubReauthRequired: false,
  yours: [],
  waitingOnYou: [],
};
