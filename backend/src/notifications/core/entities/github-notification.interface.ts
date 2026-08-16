import { NotificationType } from './notification-type.enum';

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
}
