import { GithubNotificationNormalized } from '../../../core/entities/github-notification.interface';

export class PokeMessageNormalized {
  id: string;
  userId: string;
  userGithubId?: string;
  teamId: string;
  channelId: string;
  messageTs: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  notification: GithubNotificationNormalized;
}
