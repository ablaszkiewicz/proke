import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsService } from '../../analytics/analytics.service';
import { SlackLinkWriteService } from '../../slack/links/write/slack-link-write.service';
import { SlackWorkspaceWriteService } from '../../slack/workspaces/write/slack-workspace-write.service';
import { SubscriptionWriteService } from '../../subscriptions/write/subscription-write.service';
import { UserWriteService } from '../write/user-write.service';

/**
 * Deletes an account and everything proke holds because of it.
 *
 * Every collection keyed on a user id is cleared here, which is why this sits above them rather
 * than inside any one of them. Nothing is soft-deleted: a request to be forgotten that leaves
 * the row in place with a flag on it has not been honoured.
 *
 * The user row goes last on purpose. It is what authenticates the caller, so while it survives
 * a half-finished deletion is one the user can simply ask for again; dropping it first would
 * strand the rest with no way back in to clean up.
 */
@Injectable()
export class UserDeletionService {
  private readonly logger = new Logger(UserDeletionService.name);

  constructor(
    private readonly userWriteService: UserWriteService,
    private readonly subscriptionWriteService: SubscriptionWriteService,
    private readonly slackLinkWriteService: SlackLinkWriteService,
    private readonly slackWorkspaceWriteService: SlackWorkspaceWriteService,
    private readonly analytics: AnalyticsService,
  ) {}

  public async deleteAccount(userId: string): Promise<void> {
    // Before the account goes, not after. Capture queues in memory and flushes later, but the
    // event is stamped with this distinct id now - and once the row is gone there is nothing
    // left to read it from.
    this.analytics.capture(userId, 'account_deleted');

    // Which organisations they asked to hear about.
    await this.subscriptionWriteService.deleteForUser(userId);

    // Who they are inside every Slack workspace, and the cached DM channel with them.
    await this.slackLinkWriteService.deleteForUser(userId);

    // Workspaces they installed proke into stay installed for the colleagues still using them;
    // only the pointer back at this user goes.
    await this.slackWorkspaceWriteService.clearInstalledBy(userId);

    // The account itself, including the encrypted GitHub token on it.
    await this.userWriteService.delete(userId);

    this.logger.log(`Deleted account ${userId} and everything keyed to it`);
  }
}
