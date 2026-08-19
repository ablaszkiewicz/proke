import { GithubNotificationNormalized } from '../../../core/entities/github-notification.interface';

/**
 * Somebody who has reviewed the pull request without deciding about it, since the poke went out.
 *
 * By id as well as by handle, for the reason everything about people is: the id is what says
 * whether the next such review is from the same person, and whether it is from the reader.
 */
export interface PokeMessageReviewer {
  githubId?: string;
  login?: string;
}

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
  /** In the order they reviewed. Empty until somebody has. */
  reviewers: PokeMessageReviewer[];
}
