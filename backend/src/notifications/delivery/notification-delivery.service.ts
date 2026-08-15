import { Injectable, Logger } from '@nestjs/common';
import { UserNormalized } from '../../user/core/entities/user.interface';
import { GithubNotificationNormalized } from '../core/entities/github-notification.interface';

/**
 * Where a notification goes once we have it. A logging stub until Slack is wired up - callers
 * are deliberately kept ignorant of the destination, so adding Slack, and later other
 * platforms, is a change in here only.
 */
@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  public async deliver(
    user: UserNormalized,
    notification: GithubNotificationNormalized,
  ): Promise<void> {
    const recipient = user.githubLogin ?? user.email ?? user.id;

    this.logger.log(
      `poke ${recipient}: [${notification.type}] ${notification.repositoryFullName} - ` +
        `${notification.title} (by ${notification.actorLogin}) ${notification.htmlUrl}`,
    );
  }
}
