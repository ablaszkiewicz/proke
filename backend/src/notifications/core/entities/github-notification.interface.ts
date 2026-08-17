import { NotificationType } from './notification-type.enum';

/**
 * How big the change is. Two numbers rather than a total, because "+400 −4" and "+202 −202" are
 * the same total and completely different asks.
 */
export interface GithubDiffStat {
  additions: number;
  deletions: number;
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
}
