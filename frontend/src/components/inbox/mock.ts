/**
 * Stand-in data for the inbox. Deliberately not wired to the API - this page is about layout,
 * and a fixed set of rows keeps the sections comparable while the shape is still being argued
 * about.
 *
 * The fields are named for what the real thing would carry, so swapping the mock for a fetch is
 * a change of source rather than a rewrite of every row. Two exceptions are called out below:
 * `age` is a pre-formatted string, and `group` is stated rather than derived.
 */

export interface MockActor {
  login: string;
  /** Real GitHub avatars. Avatar falls back to initials when the network says no. */
  avatarUrl: string;
}

/** How the whole pull request is doing on CI. */
export type CheckState = "success" | "failure" | "pending" | "none";

/** GitHub's `reviewDecision`, plus the state it has no value for. */
export type ReviewState =
  "approved" | "changes_requested" | "review_required" | "none";

export interface MockPullRequest {
  id: string;
  title: string;
  /** `owner/name`, as GitHub cases it. */
  repo: string;
  number: number;
  author: MockActor;
  additions: number;
  deletions: number;
  /** Review threads, settled over total. The `3/16` in the reference. */
  threads: { resolved: number; total: number };
  /** Everyone whose review has been asked for. Not who has answered. */
  reviewers: MockActor[];
  checks: CheckState;
  review: ReviewState;
  isDraft?: boolean;
  /** Nothing has changed on it since you last looked. Drives the dot in the gutter. */
  unread?: boolean;
}

/**
 * A pull request waiting on the reader, plus the two things proke knows that GitHub's own inbox
 * does not.
 */
export interface MockReviewRequest extends MockPullRequest {
  /**
   * How long ago *you* were asked, in hours. Never rendered - the page shows no times at all -
   * but it is what the sections are ordered by, so the person who has been waiting since Tuesday
   * outranks the bot that rebased its own branch an hour ago.
   *
   * Only proke can answer it: the review request arrives as a webhook, so the moment it landed
   * is a fact this app owns. GitHub's own inbox can only order by when the branch last moved.
   */
  askedHoursAgo: number;
  /**
   * Which pile this belongs in. Stated here, derived in the real thing - team membership is a
   * GitHub call (the app already makes it for team mentions), and "is a bot" is the same
   * judgement the webhook router makes when it drops bot chatter.
   */
  group: "team" | "others" | "bots";
}

function actor(login: string): MockActor {
  return { login, avatarUrl: `https://github.com/${login}.png?size=64` };
}

const ME = actor("ablaszkiewicz");
const CAT = actor("cat-ph");
const HUGUES = actor("hpouillot");
const JAKE = actor("jakesciotto");
const VEKSA = actor("veksa");
const WENYU = actor("gewenyu99");
const UPGRADER = actor("posthog-js-upgrader");
const INKEEP = actor("inkeep");

export const MOCK_VIEWER = ME;

/**
 * Which pile one of your own pull requests sits in. A union rather than a loose string, so the
 * page cannot ask for a section the mock does not have.
 */
export type MineSectionKey =
  "ready-to-merge" | "unresolved-comments" | "waiting-for-reviewers" | "drafts";

/** Your own open pull requests, in the four states worth telling apart. */
export const MOCK_MINE: Record<MineSectionKey, MockPullRequest[]> = {
  "ready-to-merge": [
    {
      id: "m1",
      title: "feat(webpack): add event release mode with native debug ids",
      repo: "PostHog/posthog-js",
      number: 4563,
      author: ME,
      additions: 97,
      deletions: 0,
      threads: { resolved: 2, total: 2 },
      reviewers: [CAT, HUGUES],
      checks: "success",
      review: "approved",
      unread: true,
    },
    {
      id: "m2",
      title: "fix(flags): stop double-counting local evaluation calls",
      repo: "PostHog/posthog",
      number: 86980,
      author: ME,
      additions: 42,
      deletions: 18,
      threads: { resolved: 3, total: 3 },
      reviewers: [VEKSA],
      checks: "success",
      review: "approved",
    },
  ],
  "unresolved-comments": [
    {
      id: "m3",
      title: "feat(error-tracking): symbolicate stack traces on ingest",
      repo: "PostHog/posthog",
      number: 87012,
      author: ME,
      additions: 812,
      deletions: 134,
      threads: { resolved: 2, total: 9 },
      reviewers: [HUGUES, VEKSA, JAKE],
      checks: "success",
      review: "changes_requested",
      unread: true,
    },
    {
      id: "m4",
      title: "refactor(replay): move snapshot chunking into rust",
      repo: "PostHog/posthog",
      number: 86844,
      author: ME,
      additions: 1204,
      deletions: 390,
      threads: { resolved: 5, total: 12 },
      reviewers: [CAT, JAKE],
      checks: "failure",
      review: "changes_requested",
    },
  ],
  "waiting-for-reviewers": [
    {
      id: "m5",
      title: "feat(inbox): pending review page behind a flag",
      repo: "ablaszkiewicz/proke",
      number: 34,
      author: ME,
      additions: 640,
      deletions: 12,
      threads: { resolved: 0, total: 1 },
      reviewers: [CAT],
      checks: "pending",
      review: "review_required",
      unread: true,
    },
    {
      // The row the section exists for: asked nobody, so nobody is coming.
      id: "m6",
      title: "refactor: move deploy config under infrastructure/",
      repo: "ablaszkiewicz/proke",
      number: 31,
      author: ME,
      additions: 214,
      deletions: 180,
      threads: { resolved: 0, total: 0 },
      reviewers: [],
      checks: "success",
      review: "review_required",
    },
  ],
  drafts: [
    {
      id: "m7",
      title: "spike(signals): scout dedupe via scratchpad memory",
      repo: "PostHog/posthog",
      number: 87104,
      author: ME,
      additions: 318,
      deletions: 22,
      threads: { resolved: 0, total: 0 },
      reviewers: [],
      checks: "none",
      review: "none",
      isDraft: true,
    },
    {
      id: "m8",
      title: "wip: rate-limit accounting for the review inbox",
      repo: "ablaszkiewicz/proke",
      number: 36,
      author: ME,
      additions: 88,
      deletions: 4,
      threads: { resolved: 0, total: 0 },
      reviewers: [],
      checks: "failure",
      review: "none",
      isDraft: true,
    },
  ],
};

/** Other people's pull requests that named you as a reviewer. */
export const MOCK_REVIEWS: MockReviewRequest[] = [
  {
    id: "r1",
    title: "feat(server): opt-in uncaught exception capture",
    repo: "PostHog/posthog-android",
    number: 671,
    author: CAT,
    askedHoursAgo: 3,
    additions: 1029,
    deletions: 11,
    threads: { resolved: 3, total: 16 },
    reviewers: [ME, HUGUES, JAKE, VEKSA],
    checks: "failure",
    review: "review_required",
    group: "team",
    unread: true,
  },
  {
    id: "r2",
    title: "fix(error-tracking): query issues by severity",
    repo: "PostHog/posthog",
    number: 86409,
    author: HUGUES,
    askedHoursAgo: 96,
    additions: 494,
    deletions: 10,
    threads: { resolved: 1, total: 4 },
    reviewers: [ME, CAT, VEKSA],
    checks: "success",
    review: "review_required",
    group: "team",
    unread: true,
  },
  {
    id: "r3",
    title: "feat(react-native): record automatic exception steps",
    repo: "PostHog/posthog-js",
    number: 4573,
    author: JAKE,
    askedHoursAgo: 10,
    additions: 664,
    deletions: 1,
    threads: { resolved: 1, total: 5 },
    reviewers: [ME, CAT],
    checks: "success",
    review: "review_required",
    group: "team",
  },
  {
    id: "r4",
    title: "chore(browser): stop publishing dist source maps to npm",
    repo: "PostHog/posthog-js",
    number: 4520,
    author: VEKSA,
    askedHoursAgo: 144,
    additions: 147,
    deletions: 0,
    threads: { resolved: 4, total: 4 },
    reviewers: [ME, JAKE],
    checks: "success",
    review: "approved",
    group: "others",
  },
  {
    id: "r5",
    title:
      "feat(wizard-tools): publish_handoff creates the notebook, outro opens it",
    repo: "PostHog/wizard",
    number: 1047,
    author: WENYU,
    askedHoursAgo: 504,
    additions: 1192,
    deletions: 199,
    threads: { resolved: 0, total: 1 },
    reviewers: [ME],
    checks: "success",
    review: "review_required",
    group: "others",
  },
  {
    id: "r6",
    title: "chore(deps): update posthoganalytics to 7.41.0",
    repo: "PostHog/posthog",
    number: 87088,
    author: UPGRADER,
    askedHoursAgo: 6,
    additions: 12,
    deletions: 12,
    threads: { resolved: 0, total: 3 },
    reviewers: [ME, CAT],
    checks: "success",
    review: "review_required",
    group: "bots",
  },
  {
    id: "r7",
    title: "chore(deps): Update posthog-js-lite to 4.10.4",
    repo: "PostHog/posthog",
    number: 87099,
    author: UPGRADER,
    askedHoursAgo: 6,
    additions: 18,
    deletions: 13,
    threads: { resolved: 0, total: 3 },
    reviewers: [ME, CAT],
    checks: "success",
    review: "review_required",
    group: "bots",
  },
  {
    id: "r8",
    title: "docs(cli): Document POSTHOG_CLI_DOTENV_FILE environment variable",
    repo: "PostHog/posthog.com",
    number: 18578,
    author: INKEEP,
    askedHoursAgo: 384,
    additions: 44,
    deletions: 42,
    threads: { resolved: 5, total: 7 },
    reviewers: [ME],
    checks: "success",
    review: "review_required",
    group: "bots",
  },
];
