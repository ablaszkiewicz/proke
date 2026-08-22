import {
  MOCK_MINE,
  MOCK_REVIEWS,
  type MineSectionKey,
  type MockPullRequest,
  type MockReviewRequest,
} from "./mock";

/**
 * The grouping and the ordering, in one place, so every variant in the gallery is arguing about
 * presentation rather than about which pull requests belong where.
 *
 * Within "Yours" the sections run from least to most work outstanding - a merge button, then a
 * thread to answer, then a wait on somebody else - so the top is always the thing you can
 * finish. Within "Waiting on you" they run by how much your answer is worth to a person: your
 * team is blocked on you, a stranger is inconvenienced, and a dependency bump is neither.
 */
export interface SectionSpec<K> {
  key: K;
  title: string;
  /** Only some variants render this. It is here so the ones that do agree on the words. */
  blurb: string;
}

export const MINE_SECTIONS: SectionSpec<MineSectionKey>[] = [
  { key: "ready-to-merge", title: "Approved", blurb: "green and signed off" },
  {
    key: "unresolved-comments",
    title: "Unresolved comments",
    blurb: "someone is waiting on your reply",
  },
  {
    key: "waiting-for-reviewers",
    title: "Waiting for reviewers",
    blurb: "nobody has answered yet",
  },
  { key: "drafts", title: "Drafts", blurb: "not asking anything of anyone" },
];

/** The three above drafts. Most variants close drafts, or leave them out of a summary. */
export const MINE_OPEN_SECTIONS = MINE_SECTIONS.slice(0, 3);

export const REVIEW_SECTIONS: SectionSpec<MockReviewRequest["group"]>[] = [
  { key: "team", title: "Your team", blurb: "blocked on you" },
  { key: "others", title: "Everyone else", blurb: "waiting, not blocked" },
  { key: "bots", title: "Bots", blurb: "whenever you get to it" },
];

export function mineIn(key: MineSectionKey): MockPullRequest[] {
  return MOCK_MINE[key];
}

/** Oldest ask first - see askedHoursAgo. The age decides the order and is never shown. */
export function reviewsIn(
  group: MockReviewRequest["group"]
): MockReviewRequest[] {
  return MOCK_REVIEWS.filter((review) => review.group === group).sort(
    (a, b) => b.askedHoursAgo - a.askedHoursAgo
  );
}

export const MINE_OPEN_COUNT = MINE_OPEN_SECTIONS.reduce(
  (total, section) => total + MOCK_MINE[section.key].length,
  0
);
