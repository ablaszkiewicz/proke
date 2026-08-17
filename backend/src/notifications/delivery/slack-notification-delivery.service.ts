import { Injectable, Logger } from '@nestjs/common';
import { PokeTrigger } from '../../analytics/analytics-events';
import { AnalyticsService } from '../../analytics/analytics.service';
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
 * What a Slack message was, for analytics only.
 *
 * Separate from SlackMessage on purpose: that is what the user reads, this is what we count.
 * Threading it through `send` rather than deriving it from the rendered message means the one
 * choke point every Slack message passes through can describe every message honestly - a test
 * poke is not a notification and should never be counted as one.
 */
interface PokeContext {
  trigger: PokeTrigger;
  /** A NotificationType for real pokes; `test` or `welcome` for the two synthetic ones. */
  pokeType: string;
  /** owner/name. Absent on the synthetic messages, which come from no repository. */
  repository?: string;
  actorLogin?: string;
  reviewState?: string;
  hasExcerpt?: boolean;
}

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
    private readonly analytics: AnalyticsService,
  ) {}

  public async deliver(
    user: UserNormalized,
    notification: GithubNotificationNormalized,
  ): Promise<SlackDeliveryOutcome> {
    return this.send(user.id, buildPokeMessage(notification), {
      trigger: 'github_webhook',
      pokeType: notification.type,
      repository: notification.repositoryFullName,
      actorLogin: notification.actorLogin,
      reviewState: notification.reviewState,
      hasExcerpt: Boolean(notification.excerpt),
    });
  }

  /**
   * The dashboard's test button. Unlike a real poke this one reports why it failed - the whole
   * point is to find out before a real notification is riding on it.
   */
  public async deliverTest(user: UserNormalized): Promise<SlackDeliveryOutcome> {
    return this.send(
      user.id,
      buildTestMessage(user.githubLogin),
      { trigger: 'test', pokeType: 'test' },
      { rethrow: true },
    );
  }

  /**
   * The same message, sent the moment a connection becomes complete rather than when somebody
   * asks for it. Nobody pressed anything here, so unlike the test button a refusal is an
   * outcome to log and move past - the connection itself is stored and fine either way.
   */
  public async deliverWelcome(user: UserNormalized): Promise<SlackDeliveryOutcome> {
    return this.send(user.id, buildTestMessage(user.githubLogin), {
      trigger: 'welcome',
      pokeType: 'welcome',
    });
  }

  private async send(
    userId: string,
    message: SlackMessage,
    context: PokeContext,
    options: { rethrow?: boolean } = {},
  ): Promise<SlackDeliveryOutcome> {
    const link = await this.linkReadService.readForUser(userId);

    // Nothing captured on either of these. They are not failures, they are people who have not
    // finished connecting - and a poke that had nowhere to go says exactly the same thing every
    // time it happens, once per event in every repository they are subscribed to. Whether
    // somebody has connected Slack is a fact about the person, not about each poke.
    if (!link) {
      return 'no-link';
    }

    const workspace = await this.workspaceReadService.readLiveWithToken(link.teamId);

    if (!workspace) {
      return 'workspace-missing';
    }

    try {
      await this.post(link, workspace.botToken, message);
      this.record(userId, context, 'poke_sent');

      return 'sent';
    } catch (error) {
      const outcome = await this.handleFailure(link, error);

      // Only reachable once Slack has actually been asked and said no, which is what separates
      // this from the two quiet returns above. Note that `workspace-missing` means something
      // different down here: not "never installed" but "the bot token was alive until this
      // moment", which is the whole workspace going down and worth every one of these events.
      //
      // Recorded before the rethrow, so the test button's failures are counted like any other
      // rather than disappearing into the exception that reports them.
      this.record(userId, context, 'poke_failed', outcome);

      if (options.rethrow) {
        throw error;
      }

      return outcome;
    }
  }

  /**
   * Every Slack message proke actually attempts, counted in one place.
   *
   * Two event names rather than one with an `outcome` property: an event called "sent" that
   * also means "tried and failed" makes every chart built on it ambiguous, and the number of
   * attempts is just the two added together.
   *
   * The distinct id is the *recipient* - the event is about somebody being poked, not about
   * whoever caused it. That person is `actor_login`, a property.
   */
  private record(
    userId: string,
    context: PokeContext,
    event: 'poke_sent' | 'poke_failed',
    reason?: SlackDeliveryOutcome,
  ): void {
    this.analytics.capture(userId, event, {
      poke_type: context.pokeType,
      trigger: context.trigger,
      repository: context.repository,
      // Split out here rather than in a query: grouping pokes by organisation is the first
      // question anyone asks of this data, and it should not need string surgery in HogQL.
      repository_owner: context.repository?.split('/')[0],
      actor_login: context.actorLogin,
      review_state: context.reviewState,
      has_excerpt: context.hasExcerpt,
      reason,
    });
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
