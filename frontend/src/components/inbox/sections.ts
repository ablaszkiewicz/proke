import {
  MOCK_MINE,
  MOCK_REVIEWS,
  type MineSectionKey,
  type MockPullRequest,
  type MockReviewRequest,
} from "./mock";

/**
 * The grouping and the ordering, kept apart from the page that renders them.
 *
 * Within "Yours" the sections run from least to most work outstanding - a merge button, then a
 * thread to answer, then a wait on somebody else - so the top is always the thing you can
 * finish. Within "Waiting on you" they run by how much your answer is worth to a person: your
 * team is blocked on you, a stranger is inconvenienced, and a dependency bump is neither.
 */
export interface SectionSpec<K> {
  key: K;
  title: string;
}

export const MINE_SECTIONS: SectionSpec<MineSectionKey>[] = [
  { key: "ready-to-merge", title: "Approved" },
  {
    key: "unresolved-comments",
    title: "Unresolved comments",
  },
  {
    key: "waiting-for-reviewers",
    title: "Waiting for reviewers",
  },
  { key: "drafts", title: "Drafts" },
];

export const REVIEW_SECTIONS: SectionSpec<MockReviewRequest["group"]>[] = [
  { key: "team", title: "Your team" },
  { key: "others", title: "Everyone else" },
  { key: "bots", title: "Bots" },
];

export function mineIn(key: MineSectionKey): MockPullRequest[] {
  return MOCK_MINE[key];
}

/** Oldest ask first - see askedHoursAgo. The age decides the order and is never shown. */
export function reviewsIn(
  group: MockReviewRequest["group"],
): MockReviewRequest[] {
  return MOCK_REVIEWS.filter((review) => review.group === group).sort(
    (a, b) => b.askedHoursAgo - a.askedHoursAgo,
  );
}
