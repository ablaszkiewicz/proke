/**
 * What a poke is about.
 *
 * These are preference keys first and payload metadata second: every value has to be something
 * a user could plausibly want to switch off on its own, which is why "comment on your PR" and
 * "mentioned you on a PR" are separate even though both arrive as `issue_comment`.
 *
 * Being named through a team is deliberately *not* one of the distinctions. A review asked of
 * your team is a review asked of you, and `@acme/reviewers` in a comment is somebody talking to
 * you; both carry a `teamHandle` so the message can say which team, and neither is a key of its
 * own. A separate switch would have asked everybody to answer a question about GitHub's
 * plumbing - "do you want the ones that arrived via a group?" - that nobody thinks in.
 *
 * Adding a value is additive: nothing stores what somebody wants, only what they have switched
 * off, so a new type starts on for everybody instead of silently off.
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
   * Somebody commented on an issue you opened. The counterpart to the pull request one, and
   * separate from it because the two are different rooms: a pull request comment is usually
   * about work of yours already in flight, while an issue you filed can keep collecting replies
   * for months. Plenty of people want one and not the other.
   */
  IssueComment = 'issue_comment',
  /**
   * Somebody answered in a review thread you started. GitHub points every reply in a thread at
   * the comment that opened it, so this is "in your thread" rather than "to your last word" -
   * there is no pointer to the comment immediately above.
   */
  CommentReply = 'comment_reply',
  /**
   * Somebody named you on a pull request - by handle, or through a team you are in. The two are
   * one type because they are one experience: you were named somewhere, and the poke says who
   * by and where. Which of the two it was is carried on `teamHandle` for the message to say.
   */
  PullRequestMention = 'pull_request_mention',
  /** The same, on an issue. */
  IssueMention = 'issue_mention',
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
  // Beside the pull request comment for the same reason it sits above the mentions: being
  // answered on something you opened is the more specific relationship. The two never compete -
  // one comment is on an issue or on a pull request, never both.
  NotificationType.IssueComment,
  // Last, and beside each other for the same reason the two comments are: one mention is on a
  // pull request or on an issue, never both, so the pair never actually competes.
  NotificationType.PullRequestMention,
  NotificationType.IssueMention,
];

export function comparePriority(a: NotificationType, b: NotificationType): number {
  return PRIORITY.indexOf(a) - PRIORITY.indexOf(b);
}
