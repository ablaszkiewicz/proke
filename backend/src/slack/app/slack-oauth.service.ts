import { BadRequestException, Injectable } from '@nestjs/common';
import { MetricsService } from '../../analytics/metrics.service';
import { getEnvConfig } from '../../shared/configs/env-configs';

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const ACCESS_URL = 'https://slack.com/api/oauth.v2.access';

// Enough to open a DM and post in it, and nothing else. Anything wider would be asking a
// workspace admin to approve powers proke does not use.
const BOT_SCOPES = ['chat:write', 'im:write'];
// Asked for in both flows: it is the whole of the identity step, and in the install flow it is
// what gets the installer linked in the same round trip instead of a second one.
const USER_SCOPES = ['identity.basic'];

export interface SlackOAuthResult {
  teamId: string;
  teamName: string;
  /** Present only when the exchange installed the bot; identity-only flows have none. */
  botToken?: string;
  botUserId?: string;
  botScopes?: string;
  slackUserId?: string;
  /** Short-lived, used once to read the identity and then dropped rather than stored. */
  userToken?: string;
}

@Injectable()
export class SlackOAuthService {
  constructor(private readonly metrics: MetricsService) {}

  /**
   * Sign in with Slack. Identity only: it installs nothing, so any member can complete it
   * without an admin being involved.
   */
  public buildConnectUrl(state: string): string {
    return this.buildUrl({ state, userScopes: USER_SCOPES });
  }

  /**
   * Add the bot. Often needs permission to install apps, and Slack runs its own
   * request-an-admin flow when the user does not have it - which is why proke never asks for
   * this until it knows the workspace actually lacks it.
   */
  public buildInstallUrl(state: string, teamId?: string): string {
    return this.buildUrl({ state, userScopes: USER_SCOPES, botScopes: BOT_SCOPES, teamId });
  }

  public async exchangeCode(code: string): Promise<SlackOAuthResult> {
    const { clientId, clientSecret, redirectUri } = getEnvConfig().slack;

    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Slack is not configured. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in ' +
          'backend/.env, then restart the backend.',
      );
    }

    // Timed like every other Slack call, though it does not go through SlackApiService: this is
    // the one request in the connect flow that can leave somebody stuck on a callback page, and
    // it is the only Slack call proke makes that no user is waiting on a poke for.
    const startedAt = Date.now();
    const response = await fetch(ACCESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        // Slack checks this matches the one the user was sent to, so it has to be sent again.
        redirect_uri: redirectUri,
      }).toString(),
    });

    const data = await response.json().catch(() => null);

    this.metrics.duration('proke.slack.request.duration', Date.now() - startedAt, {
      method: 'oauth.access',
      outcome: data?.ok ? 'ok' : 'error',
    });

    // Like GitHub, Slack reports OAuth failures with a 200 and an error body.
    if (!data?.ok) {
      throw new BadRequestException(
        `Slack rejected the authorization: ${data?.error ?? 'no response body'}`,
      );
    }

    return {
      teamId: data.team?.id ?? '',
      teamName: data.team?.name ?? '',
      botToken: data.access_token,
      botUserId: data.bot_user_id,
      botScopes: data.scope,
      slackUserId: data.authed_user?.id,
      userToken: data.authed_user?.access_token,
    };
  }

  private buildUrl(options: {
    state: string;
    userScopes: string[];
    botScopes?: string[];
    teamId?: string;
  }): string {
    const { clientId, redirectUri } = getEnvConfig().slack;

    const params = new URLSearchParams({
      client_id: clientId,
      user_scope: options.userScopes.join(','),
      redirect_uri: redirectUri,
      state: options.state,
    });

    if (options.botScopes) {
      params.set('scope', options.botScopes.join(','));
    }

    // Preselects the workspace, so someone in five of them cannot accidentally install proke
    // into the wrong one after we have already told them which is missing it.
    if (options.teamId) {
      params.set('team', options.teamId);
    }

    return `${AUTHORIZE_URL}?${params.toString()}`;
  }
}
