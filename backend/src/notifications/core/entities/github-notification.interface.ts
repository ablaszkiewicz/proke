import { NotificationType } from './notification-type.enum';

/**
 * How big the change is. Two numbers rather than a total, because "+400 −4" and "+202 −202" are
 * the same total and completely different asks.
 */
export interface GithubDiffStat {
  additions: number;
  deletions: number;
}

/**
 * The comments a review arrived with, once several pokes have been folded into one.
 *
 * A count rather than the comments themselves: the message quotes exactly one of them and links
 * to the review for the rest, so carrying the others would be carrying them nowhere.
 */
/**
 * The review states that are a verdict on the change, as opposed to somebody talking about it.
 *
 * A review that is neither is an envelope: GitHub opens one behind every set of inline comments,
 * including the single comment left outside a review, and where it carries no words of its own
 * there is nothing in it to report beyond the comments themselves.
 */
export const REVIEW_VERDICTS = ['approved', 'changes_requested'] as const;

export type GithubReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export function isReviewVerdict(state: string | undefined): state is GithubReviewVerdict {
  return REVIEW_VERDICTS.includes(state as GithubReviewVerdict);
}

export interface GithubNotificationComments {
  count: number;
  /**
   * Whether they named the recipient rather than merely landing on their pull request. Being
   * mentioned is why somebody is being poked, and must not be flattened into "left 3 comments".
   */
  mentioned: boolean;
}

export interface GithubNotificationNormalized {
  type: NotificationType;
  title: string;
  repositoryFullName: string;
  // Webhook payloads carry a real html_url, unlike the Notifications API which only ever
  // handed back api.github.com links.
  htmlUrl: string;
  actorLogin: string;
  /** The #number. How people refer to a pull request or an issue when they talk about it. */
  number?: number;
  /**
   * `approved`, `changes_requested` or `commented`, on a submitted review only. The type says
   * a review happened; this says whether it was good news.
   */
  reviewState?: string;
  /**
   * What the person actually wrote - the comment, the review, the description they mentioned
   * you in. Absent where no words were involved: a review request and a merge are events, not
   * messages, and inventing a quote for them would be misleading.
   *
   * Full length and unformatted. How much of it to show is the destination's business.
   */
  excerpt?: string;
  /** `org/team`, on a team mention only - the recipient was named as part of a group. */
  teamHandle?: string;
  /**
   * The avatar of whoever owns the repository - an organisation's logo, or a person's face for
   * a repository they own themselves. Recognised far faster than the name beside it is read.
   */
  ownerAvatarUrl?: string;
  /**
   * Pull requests only, and only where we could establish it. Webhooks carry the line counts on
   * `pull_request` events and on no others, so a poke about a comment has to go and ask.
   */
  diff?: GithubDiffStat;
  /**
   * Whether the thing is a pull request rather than an issue. A team mention can be either, and
   * only a pull request has a diff worth asking GitHub for.
   */
  isPullRequest?: boolean;
  /**
   * Which review this belongs to, on the two events a review is delivered as - the submission
   * itself, and one per inline comment. GitHub puts the same id on all of them, which is what
   * lets a review that arrived as six webhooks leave as one poke.
   */
  reviewId?: string;
  /**
   * The inline comment this came from, absent on the review submission itself. Sorts the
   * comments back into the order they were written, since webhooks do not arrive in one.
   */
  commentId?: string;
  /**
   * What the rest of the review held, set only where a poke stands for more than one event.
   * Absent means this poke is about exactly one thing, which is every poke that was never
   * batched with anything.
   */
  comments?: GithubNotificationComments;
}
