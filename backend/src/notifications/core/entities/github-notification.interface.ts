import { NotificationType } from './notification-type.enum';

export interface GithubNotificationNormalized {
  type: NotificationType;
  title: string;
  repositoryFullName: string;
  // Webhook payloads carry a real html_url, unlike the Notifications API which only ever
  // handed back api.github.com links.
  htmlUrl: string;
  actorLogin: string;
}
