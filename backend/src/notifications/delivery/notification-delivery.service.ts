import { Injectable, Logger } from '@nestjs/common';
import { UserNormalized } from '../../user/core/entities/user.interface';
import { GithubNotificationNormalized } from '../core/entities/github-notification.interface';
import { SlackNotificationDeliveryService } from './slack-notification-delivery.service';

/**
 * Where a notification goes once we have it. Callers are deliberately kept ignorant of the
 * destination, so adding a second platform stays a change in here only.
 *
 * Slack is the only destination today, and not having one is an ordinary state rather than a
 * failure: plenty of users sign in, opt into an organisation, and only connect Slack later.
 * Those pokes are logged and dropped - there is nowhere to hold them, and a poke about a
 * three-day-old review request is worse than no poke.
 */
@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(private readonly slackDeliveryService: SlackNotificationDeliveryService) {}

  public async deliver(
    user: UserNormalized,
    notification: GithubNotificationNormalized,
  ): Promise<void> {
    const outcome = await this.slackDeliveryService.deliver(user, notification);
    const recipient = user.githubLogin ?? user.email ?? user.id;

    if (outcome === 'sent') {
      this.logger.log(
        `poked ${recipient} in Slack: [${notification.type}] ${notification.repositoryFullName}`,
      );
      return;
    }

    this.logger.log(
      `poke ${recipient} (${outcome}): [${notification.type}] ` +
        `${notification.repositoryFullName} - ${notification.title} ` +
        `(by ${notification.actorLogin}) ${notification.htmlUrl}`,
    );
  }
}
