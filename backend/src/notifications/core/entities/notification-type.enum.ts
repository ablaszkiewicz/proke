/**
 * What a poke is about.
 *
 * These are preference keys first and payload metadata second: every value has to be something
 * a user could plausibly want to switch off on its own, which is why "comment on your PR" and
 * "mentioned you on a PR" are separate even though both arrive as `issue_comment`.
 *
 * Adding a value is additive: a subscription that never customised its list stores no list at
 * all and means "everything", so a new type starts on for everybody instead of silently off.
 * Only someone who has explicitly picked types has to opt in to a later addition.
 */
export enum NotificationType {
  ReviewRequested = 'review_requested',
  ReviewSubmitted = 'review_submitted',
  PullRequestMerged = 'pull_request_merged',
  /**
   * Somebody armed the pull request to merge itself the moment its checks go green. Its own
   * type rather than a flavour of the merge: what it reports is a decision that has been taken
   * but not yet acted on, and the window to object to it closes with the last check.
   */
  AutoMergeEnabled = 'auto_merge_enabled',
  PullRequestComment = 'pull_request_comment',
  /**
   * Somebody answered in a review thread you started. GitHub points every reply in a thread at
   * the comment that opened it, so this is "in your thread" rather than "to your last word" -
   * there is no pointer to the comment immediately above.
   */
  CommentReply = 'comment_reply',
  PullRequestMention = 'pull_request_mention',
  IssueMention = 'issue_mention',
  /** `@org/team`, on a pull request or an issue alike - the link says which it was. */
  TeamMention = 'team_mention',
}

export const ALL_NOTIFICATION_TYPES: NotificationType[] = Object.values(NotificationType);

/**
 * One event can produce several candidate pokes for the same person - being mentioned in a
 * comment on your own pull request is both a mention and a comment. They collapse to one poke,
 * and this decides which survives: the more specific the relationship, the higher it sits.
 */
const PRIORITY: NotificationType[] = [
  NotificationType.ReviewRequested,
  NotificationType.PullRequestMerged,
  // Under the merge, which is the same news arrived at its end. The two never compete in
  // practice - one payload carries one action - so this is ordering for whoever reads the list
  // rather than a collapse that happens.
  NotificationType.AutoMergeEnabled,
  NotificationType.ReviewSubmitted,
  // Above both the comment and the mention: being answered in your own thread is a more specific
  // reason to be poked than somebody having commented on your pull request, and more useful to
  // be told than that they also happened to write your handle.
  NotificationType.CommentReply,
  NotificationType.PullRequestComment,
  NotificationType.PullRequestMention,
  NotificationType.IssueMention,
  // Last: being asked directly outranks being included in a group.
  NotificationType.TeamMention,
];

export function comparePriority(a: NotificationType, b: NotificationType): number {
  return PRIORITY.indexOf(a) - PRIORITY.indexOf(b);
}
