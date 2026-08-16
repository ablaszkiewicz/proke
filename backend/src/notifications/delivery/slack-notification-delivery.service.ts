import { Injectable, Logger } from '@nestjs/common';
import { SlackApiError, SlackApiService, SlackMessage } from '../../slack/app/slack-api.service';
import { SlackLinkNormalized } from '../../slack/links/core/entities/slack-link.interface';
import { SlackLinkReadService } from '../../slack/links/read/slack-link-read.service';
import { SlackLinkWriteService } from '../../slack/links/write/slack-link-write.service';
import { SlackWorkspaceReadService } from '../../slack/workspaces/read/slack-workspace-read.service';
import { SlackWorkspaceWriteService } from '../../slack/workspaces/write/slack-workspace-write.service';
import { UserNormalized } from '../../user/core/entities/user.interface';
import { GithubNotificationNormalized } from '../core/entities/github-notification.interface';
import { buildPokeMessage, buildTestMessage } from './slack-message';

/**
 * Why a poke did not reach Slack. Only `sent` and `failed` are unusual; the rest are ordinary
 * states for a user who has not finished connecting, and are not worth an error.
 */
export type SlackDeliveryOutcome =
  'sent' | 'no-link' | 'workspace-missing' | 'unreachable' | 'failed';

/** Slack has told us the bot token is dead. Nothing else will work until a reinstall. */
const DEAD_WORKSPACE = ['token_revoked', 'account_inactive', 'invalid_auth', 'not_authed'];

/** The person is not there any more. The workspace is fine; this one pairing is not. */
const DEAD_LINK = ['user_not_found', 'users_not_found', 'user_disabled', 'cannot_dm_bot'];

/**
 * Puts a poke in front of somebody in Slack.
 *
 * Needs both halves of the model to line up: the link says who this person is inside a
 * workspace, the workspace holds the token allowed to message them there. Either one missing
 * is a normal, quiet outcome - people connect the two ends minutes or days apart.
 *
 * Failures Slack reports are written back rather than only logged. A revoked token or a
 * departed user would otherwise be rediscovered on every single event, forever.
 */
@Injectable()
export class SlackNotificationDeliveryService {
  private readonly logger = new Logger(SlackNotificationDeliveryService.name);

  constructor(
    private readonly linkReadService: SlackLinkReadService,
    private readonly linkWriteService: SlackLinkWriteService,
    private readonly workspaceReadService: SlackWorkspaceReadService,
    private readonly workspaceWriteService: SlackWorkspaceWriteService,
    private readonly slackApiService: SlackApiService,
  ) {}

  public async deliver(
    user: UserNormalized,
    notification: GithubNotificationNormalized,
  ): Promise<SlackDeliveryOutcome> {
    return this.send(user.id, buildPokeMessage(notification));
  }

  /**
   * The dashboard's test button. Unlike a real poke this one reports why it failed - the whole
   * point is to find out before a real notification is riding on it.
   */
  public async deliverTest(user: UserNormalized): Promise<SlackDeliveryOutcome> {
    return this.send(user.id, buildTestMessage(user.githubLogin), { rethrow: true });
  }

  private async send(
    userId: string,
    message: SlackMessage,
    options: { rethrow?: boolean } = {},
  ): Promise<SlackDeliveryOutcome> {
    const link = await this.linkReadService.readForUser(userId);

    if (!link) {
      return 'no-link';
    }

    const workspace = await this.workspaceReadService.readLiveWithToken(link.teamId);

    if (!workspace) {
      return 'workspace-missing';
    }

    try {
      await this.post(link, workspace.botToken, message);
      return 'sent';
    } catch (error) {
      const outcome = await this.handleFailure(link, error);

      if (options.rethrow) {
        throw error;
      }

      return outcome;
    }
  }

  /**
   * One post, with a single reopen behind it. A cached DM channel is nearly always still good;
   * when it is not, opening a fresh one is cheaper than never noticing.
   */
  private async post(
    link: SlackLinkNormalized,
    botToken: string,
    message: SlackMessage,
  ): Promise<void> {
    if (link.dmChannelId) {
      try {
        await this.slackApiService.postMessage(botToken, link.dmChannelId, message);
        return;
      } catch (error) {
        if (!(error instanceof SlackApiError) || error.code !== 'channel_not_found') {
          throw error;
        }

        await this.linkWriteService.clearDmChannel(link.userId, link.teamId);
      }
    }

    const channel = await this.slackApiService.openDirectMessage(botToken, link.slackUserId);
    await this.slackApiService.postMessage(botToken, channel, message);
    await this.linkWriteService.cacheDmChannel(link.userId, link.teamId, channel);
  }

  private async handleFailure(
    link: SlackLinkNormalized,
    error: unknown,
  ): Promise<SlackDeliveryOutcome> {
    if (!(error instanceof SlackApiError)) {
      this.logger.error(`Slack delivery failed for user ${link.userId}: ${error}`);
      return 'failed';
    }

    if (DEAD_WORKSPACE.includes(error.code)) {
      this.logger.warn(
        `Slack workspace ${link.teamId} rejected our token (${error.code}); marking it revoked`,
      );
      await this.workspaceWriteService.markRevoked(link.teamId);

      return 'workspace-missing';
    }

    if (DEAD_LINK.includes(error.code)) {
      this.logger.warn(
        `Slack user ${link.slackUserId} is unreachable in ${link.teamId} (${error.code}); ` +
          'dropping the link',
      );
      await this.linkWriteService.delete(link.userId, link.teamId);

      return 'unreachable';
    }

    this.logger.error(`Slack delivery failed for user ${link.userId}: ${error.code}`);

    return 'failed';
  }
}
