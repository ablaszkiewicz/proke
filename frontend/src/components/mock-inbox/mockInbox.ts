import type {
  InboxFilters,
  InboxSectionData,
  InboxSectionKey,
  InboxTeam,
  RecentDraftWindow,
} from "@/lib/api/inbox.api";

/**
 * A whole inbox that never existed, and the server's own rules run against it in the browser.
 *
 * ## What this is for
 *
 * Trying the settings out. Every one of them is a decision about how a pile of pull requests is
 * cut up, and the only honest way to judge one of those is to move it and watch rows go
 * somewhere else. Against the real inbox that means owning the right pull requests on the right
 * day; against this it means opening a page.
 *
 * ## What it is not
 *
 * The truth. The rules below are a *copy* of the server's - see inbox-classifier.ts - kept close
 * enough to be worth looking at and with no mechanism keeping them in step. They will drift, and
 * when they do the server is right and this is wrong. Nothing here is imported by the real
 * inbox, and nothing here should ever be: the argument for the server owning this is that half
 * the rules need facts a browser cannot see, and that argument does not stop being true because
 * the fixtures below happen to carry those facts.
 *
 * ## Why the timestamps are hours rather than dates
 *
 * So the fixture cannot go stale. A date written today is a draft that stops being recent
 * tomorrow, and a page for trying the recency window out would quietly stop demonstrating it.
 */

/**
 * What each window means, in hours.
 *
 * A copy of the server's, and the clearest illustration of what this whole file is: the real
 * client never knows this - it sends the word `6h` and the server decides what that reaches -
 * and a page that classifies rows itself has to.
 */
export const MOCK_WINDOW_HOURS: Record<RecentDraftWindow, number> = {
  "6h": 6,
  "12h": 12,
  "1d": 24,
  "3d": 72,
  "7d": 168,
};

export const MOCK_TEAMS: InboxTeam[] = [
  { key: "acme/platform", org: "acme", slug: "platform", name: "Platform" },
  { key: "acme/design", org: "acme", slug: "design", name: "Design" },
  // The case the whole exclusion list exists for: a team everybody is in makes "your team" mean
  // "everybody", and the section stops separating anything at all.
  { key: "acme/everyone", org: "acme", slug: "everyone", name: "Everyone at Acme" },
];

/**
 * One invented pull request, carrying what a row draws *and* what the rules read.
 *
 * On the real thing those are two different objects in two different places - the second never
 * leaves the server. Here they are one, which is the whole reason this file has to say loudly
 * that it is not the real thing.
 */
export interface MockPullRequest {
  id: string;
  number: number;
  title: string;
  repositoryFullName: string;
  login: string;
  /** Which half of the page it belongs to. Yours is what you opened; the rest is waiting on you. */
  mine: boolean;
  /** How long ago GitHub last saw it move. Drives the ordering and the recency window. */
  hoursAgo: number;
  isDraft?: boolean;
  approved?: boolean;
  unresolvedThreads?: boolean;
  isBot?: boolean;
  /** Which of your teams this author is in. Empty is everyone else. */
  teams?: string[];
}

/**
 * Enough rows to fill every heading, and a few chosen so that moving a setting visibly moves
 * something. The three drafts sit at two, twenty and forty hours precisely so that the five
 * windows do not all look the same.
 */
export const MOCK_PULL_REQUESTS: MockPullRequest[] = [
  // Yours.
  {
    id: "y1",
    number: 4821,
    title: "Cache the viewer's team membership per team rather than merged",
    repositoryFullName: "acme/api",
    login: "you",
    mine: true,
    hoursAgo: 3,
    approved: true,
  },
  {
    id: "y2",
    number: 4817,
    title: "Move the waiting-on-you grouping to serve time",
    repositoryFullName: "acme/api",
    login: "you",
    mine: true,
    hoursAgo: 9,
    approved: true,
    unresolvedThreads: true,
  },
  {
    id: "y3",
    number: 4809,
    title: "Bound the fan-out when reading team members",
    repositoryFullName: "acme/api",
    login: "you",
    mine: true,
    hoursAgo: 26,
    unresolvedThreads: true,
  },
  {
    id: "y4",
    number: 4802,
    title: "Drop the localStorage copy of the inbox filters",
    repositoryFullName: "acme/web",
    login: "you",
    mine: true,
    hoursAgo: 51,
  },
  {
    id: "y5",
    number: 4830,
    title: "Spike: settings as a drawer",
    repositoryFullName: "acme/web",
    login: "you",
    mine: true,
    hoursAgo: 2,
    isDraft: true,
  },
  {
    id: "y6",
    number: 4795,
    title: "Try a slimmer row for the inbox",
    repositoryFullName: "acme/web",
    login: "you",
    mine: true,
    hoursAgo: 20,
    isDraft: true,
  },
  {
    id: "y7",
    number: 4640,
    title: "Old experiment with a keyboard-driven inbox",
    repositoryFullName: "acme/web",
    login: "you",
    mine: true,
    hoursAgo: 40,
    isDraft: true,
  },
  {
    id: "y8",
    number: 4102,
    title: "Notes on the notification schema, abandoned",
    repositoryFullName: "acme/api",
    login: "you",
    mine: true,
    hoursAgo: 1900,
    isDraft: true,
  },

  // Waiting on you: teammates.
  {
    id: "w1",
    number: 3311,
    title: "Add a retry to the Slack delivery worker",
    repositoryFullName: "acme/api",
    login: "priya",
    mine: false,
    hoursAgo: 1,
    teams: ["acme/platform", "acme/everyone"],
  },
  {
    id: "w2",
    number: 3308,
    title: "Split the settings panel into its own module",
    repositoryFullName: "acme/web",
    login: "marcus",
    mine: false,
    hoursAgo: 5,
    teams: ["acme/design", "acme/everyone"],
  },
  {
    id: "w3",
    number: 3299,
    title: "Tidy the empty states on the connections page",
    repositoryFullName: "acme/web",
    login: "priya",
    mine: false,
    hoursAgo: 14,
    approved: true,
    teams: ["acme/platform", "acme/everyone"],
  },

  // Waiting on you: only in the company-wide team, so they move when it is struck out.
  {
    id: "w4",
    number: 3290,
    title: "Correct the pricing copy on the marketing site",
    repositoryFullName: "acme/www",
    login: "sam",
    mine: false,
    hoursAgo: 7,
    teams: ["acme/everyone"],
  },
  {
    id: "w5",
    number: 3281,
    title: "Bump the Terraform provider",
    repositoryFullName: "acme/infra",
    login: "ines",
    mine: false,
    hoursAgo: 22,
    teams: ["acme/everyone"],
  },

  // Waiting on you: nobody you share a team with.
  {
    id: "w6",
    number: 3277,
    title: "Fix the timezone on the weekly digest",
    repositoryFullName: "acme/api",
    login: "toby",
    mine: false,
    hoursAgo: 11,
  },
  {
    id: "w7",
    number: 3260,
    title: "Document the webhook retry policy",
    repositoryFullName: "acme/docs",
    login: "nadia",
    mine: false,
    hoursAgo: 33,
    approved: true,
  },

  // Waiting on you: machines.
  {
    id: "w8",
    number: 3315,
    title: "Bump @types/node from 24.3.0 to 24.5.1",
    repositoryFullName: "acme/web",
    login: "dependabot",
    mine: false,
    hoursAgo: 2,
    isBot: true,
  },
  {
    id: "w9",
    number: 3312,
    title: "Update mongoose to v9.1.1",
    repositoryFullName: "acme/api",
    login: "renovate",
    mine: false,
    hoursAgo: 4,
    isBot: true,
  },
  {
    id: "w10",
    number: 3309,
    title: "chore(deps): lockfile maintenance",
    repositoryFullName: "acme/infra",
    login: "renovate",
    mine: false,
    hoursAgo: 30,
    isBot: true,
  },
];

const YOURS_SECTIONS: InboxSectionKey[] = [
  "approved",
  "unresolved-comments",
  "waiting-for-reviewers",
  "recent-drafts",
  "drafts",
];

const WAITING_SECTIONS: InboxSectionKey[] = ["team", "others", "bots"];

/** Drafts first, then open threads above approved. A copy of the server's `yoursSection`. */
function yoursSection(
  pullRequest: MockPullRequest,
  filters: InboxFilters
): InboxSectionKey {
  if (pullRequest.isDraft) {
    const hours =
      filters.recentDrafts === "off"
        ? null
        : MOCK_WINDOW_HOURS[filters.recentDrafts];

    return hours !== null && pullRequest.hoursAgo < hours
      ? "recent-drafts"
      : "drafts";
  }

  if (pullRequest.unresolvedThreads) {
    return "unresolved-comments";
  }

  return pullRequest.approved ? "approved" : "waiting-for-reviewers";
}

/** Bots before teammates. A copy of the server's `waitingSection`. */
function waitingSection(
  pullRequest: MockPullRequest,
  filters: InboxFilters
): InboxSectionKey {
  if (pullRequest.isBot) {
    return filters.separateBots ? "bots" : "others";
  }

  const sharesTeam = (pullRequest.teams ?? []).some(
    (key) => !filters.excludedTeams.includes(key)
  );

  return filters.separateTeam && sharesTeam ? "team" : "others";
}

/**
 * The invented inbox as one set of settings would show it.
 *
 * Both halves in one pass here, where the real thing does the first at build time and the second
 * when it serves - a distinction that exists to keep a cache finite and has no meaning in a
 * browser holding twenty rows.
 */
export function classifyMockInbox(filters: InboxFilters): {
  yours: InboxSectionData[];
  waitingOnYou: InboxSectionData[];
} {
  const ordered = [...MOCK_PULL_REQUESTS].sort(
    (a, b) => a.hoursAgo - b.hoursAgo || b.number - a.number
  );

  const yours = ordered.filter((pullRequest) => pullRequest.mine);
  const waiting = ordered.filter(
    (pullRequest) =>
      !pullRequest.mine &&
      // The ignored authors go entirely, and the approved filter only ever reaches this half.
      !filters.ignoredAuthors.includes(pullRequest.login.toLowerCase()) &&
      (filters.includeApproved || !pullRequest.approved)
  );

  return {
    yours: group(yours, YOURS_SECTIONS, (pullRequest) =>
      yoursSection(pullRequest, filters)
    ),
    waitingOnYou: group(waiting, WAITING_SECTIONS, (pullRequest) =>
      waitingSection(pullRequest, filters)
    ),
  };
}

function group(
  pullRequests: MockPullRequest[],
  keys: InboxSectionKey[],
  sectionOf: (pullRequest: MockPullRequest) => InboxSectionKey
): InboxSectionData[] {
  return keys.map((key) => ({
    key,
    pullRequests: pullRequests
      .filter((pullRequest) => sectionOf(pullRequest) === key)
      .map((pullRequest) => ({
        id: pullRequest.id,
        number: pullRequest.number,
        title: pullRequest.title,
        // Deliberately nowhere. Every row on this page is invented, and a link that went to a
        // real pull request would be the one thing on it that lied.
        url: "#",
        isDraft: !!pullRequest.isDraft,
        repositoryId: pullRequest.repositoryFullName,
        repositoryFullName: pullRequest.repositoryFullName,
        author: { login: pullRequest.login },
      })),
  }));
}
