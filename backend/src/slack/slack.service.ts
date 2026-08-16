import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SlackNotificationDeliveryService } from '../notifications/delivery/slack-notification-delivery.service';
import { getEnvConfig, isSlackConfigured } from '../shared/configs/env-configs';
import { UserReadService } from '../user/read/user-read.service';
import { SlackApiError, SlackApiService } from './app/slack-api.service';
import { SlackOAuthService } from './app/slack-oauth.service';
import { SlackStateService } from './app/slack-state.service';
import { SlackConnectionResponse, SlackConnectionStatus } from './dto/slack-connection.response';
import { SlackLinkReadService } from './links/read/slack-link-read.service';
import { SlackLinkWriteService } from './links/write/slack-link-write.service';
import { SlackWorkspaceReadService } from './workspaces/read/slack-workspace-read.service';
import { SlackWorkspaceWriteService } from './workspaces/write/slack-workspace-write.service';

/**
 * Everything the dashboard's Slack panel needs, over the two collections underneath it.
 *
 * The order matters and is the whole design: identity first, installation only if it turns out
 * to be missing. Asking for bot scopes up front would send every member of an already-connected
 * workspace through an admin approval they do not need.
 */
@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(
    private readonly userReadService: UserReadService,
    private readonly linkReadService: SlackLinkReadService,
    private readonly linkWriteService: SlackLinkWriteService,
    private readonly workspaceReadService: SlackWorkspaceReadService,
    private readonly workspaceWriteService: SlackWorkspaceWriteService,
    private readonly oauthService: SlackOAuthService,
    private readonly stateService: SlackStateService,
    private readonly slackApiService: SlackApiService,
    private readonly deliveryService: SlackNotificationDeliveryService,
  ) {}

  public async readConnection(userId: string): Promise<SlackConnectionResponse> {
    const configured = isSlackConfigured();
    const state = this.stateService.sign(userId);
    const connectUrl = configured ? this.oauthService.buildConnectUrl(state) : '';

    const link = await this.linkReadService.readForUser(userId);

    if (!link) {
      return { status: SlackConnectionStatus.Unlinked, connectUrl, configured };
    }

    const workspace = await this.workspaceReadService.readByTeamId(link.teamId);

    // Two different holes, one answer: proke was never installed here, or it was and the token
    // has since been revoked. Both need somebody to add the app, so both offer the same button.
    if (!workspace || workspace.revokedAt) {
      return {
        status: SlackConnectionStatus.WorkspaceMissing,
        teamId: link.teamId,
        // `||`, not `??`: the sign-in flow asks only for an identity scope and Slack's response
        // to it frequently carries no team name, which we store as '' rather than absent. An
        // empty string passing through here is what put "in ," in front of people.
        teamName: link.teamName || workspace?.teamName,
        slackHandle: link.slackHandle,
        connectUrl,
        installUrl: configured ? this.oauthService.buildInstallUrl(state, link.teamId) : undefined,
        configured,
      };
    }

    return {
      status: SlackConnectionStatus.Linked,
      teamId: workspace.teamId,
      teamName: workspace.teamName,
      slackHandle: link.slackHandle,
      connectUrl,
      configured,
    };
  }

  /**
   * The landing point for both authorize flows. Which one happened is read off the response
   * rather than tracked through the round trip: only an install comes back with a bot token.
   */
  public async connect(
    userId: string,
    code: string,
    state: string,
  ): Promise<SlackConnectionResponse> {
    if (this.stateService.verify(state) !== userId) {
      throw new BadRequestException(
        'That Slack authorization was not for this account, or it expired. Try again.',
      );
    }

    const result = await this.oauthService.exchangeCode(code);

    if (!result.teamId) {
      throw new BadRequestException('Slack did not say which workspace this was for');
    }

    if (result.botToken && result.botUserId) {
      await this.workspaceWriteService.install({
        teamId: result.teamId,
        teamName: result.teamName,
        botUserId: result.botUserId,
        botToken: result.botToken,
        botScopes: result.botScopes,
        installedByUserId: userId,
      });
    }

    await this.link(userId, result.teamId, result.teamName, result.slackUserId, result.userToken);

    return this.readConnection(userId);
  }

  /**
   * Where to send the browser after Slack hands the code back.
   *
   * Slack insists on an https redirect URL, and in development the frontend is plain http on
   * localhost. So the public backend takes the callback and bounces it to the frontend, which
   * is the origin holding the session - landing the user on a tunnel host instead would leave
   * them on an origin with no token, looking logged out.
   *
   * The base is server configuration and only the query is copied through, so this cannot be
   * pointed at somebody else's site.
   */
  public buildAppCallbackUrl(query: Record<string, string | undefined>): string {
    const url = new URL(`${getEnvConfig().app.url}/app/callbacks/slack`);

    for (const key of ['code', 'state', 'error', 'error_description'] as const) {
      if (query[key]) {
        url.searchParams.set(key, query[key] as string);
      }
    }

    return url.toString();
  }

  public async disconnect(userId: string): Promise<void> {
    // Only the link. The workspace install belongs to whoever added it and to everyone else
    // using it - one person leaving is not grounds for uninstalling proke on their colleagues.
    await this.linkWriteService.deleteForUser(userId);
  }

  public async sendTestPoke(userId: string): Promise<void> {
    const user = await this.userReadService.readByIdOrThrow(userId);

    try {
      const outcome = await this.deliveryService.deliverTest(user);

      if (outcome === 'no-link') {
        throw new BadRequestException('Connect Slack first.');
      }

      if (outcome === 'workspace-missing') {
        throw new BadRequestException(
          'proke is not installed in that Slack workspace yet, so it cannot message you there.',
        );
      }
    } catch (error) {
      if (error instanceof SlackApiError) {
        throw new BadRequestException(`Slack refused the message: ${error.code}`);
      }

      throw error;
    }
  }

  /**
   * Records who this person is in the workspace. The user token exists only to ask Slack that
   * question - it is used once, here, and never stored.
   */
  private async link(
    userId: string,
    teamId: string,
    teamName: string,
    slackUserId: string | undefined,
    userToken: string | undefined,
  ): Promise<void> {
    let handle: string | undefined;
    let resolvedUserId = slackUserId;

    if (userToken) {
      try {
        const identity = await this.slackApiService.readIdentity(userToken);
        resolvedUserId = identity.slackUserId ?? resolvedUserId;
        handle = identity.slackHandle;
      } catch (error) {
        // The id from the OAuth response is enough to poke somebody; the handle is only ever
        // shown back to them. Not worth failing the whole connection over.
        this.logger.warn(`Could not read the Slack identity for user ${userId}: ${error}`);
      }
    }

    if (!resolvedUserId) {
      throw new BadRequestException(
        'Slack did not identify you. Authorize again and allow proke to see your identity.',
      );
    }

    await this.linkWriteService.upsert({
      userId,
      teamId,
      teamName,
      slackUserId: resolvedUserId,
      slackHandle: handle,
    });
  }
}
