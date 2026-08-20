import { Injectable, Logger } from '@nestjs/common';
import { SlackMethod, SlackOutcome, slackMethodLabel } from '../../analytics/metrics-catalog';
import { MetricsService } from '../../analytics/metrics.service';

const SLACK_API = 'https://slack.com/api';
// One retry only, and never a long one: a webhook has already been acknowledged by the time we
// get here, so a slow poke costs nothing, but an unbounded wait would pile up handlers.
const MAX_RETRY_SECONDS = 30;

/**
 * Slack has told us the bot token is dead. Nothing else will work until a reinstall.
 *
 * Here rather than in the delivery service that acts on it, because two things now need the same
 * reading of a Slack error code: delivery, which writes the workspace off, and the metric below,
 * which counts what happened. Two copies of this list would drift, and the drift would show up
 * as a chart that disagrees with the database about how many workspaces died.
 */
export const SLACK_DEAD_WORKSPACE_CODES = [
  'token_revoked',
  'account_inactive',
  'invalid_auth',
  'not_authed',
];

/** The person is not there any more. The workspace is fine; this one pairing is not. */
export const SLACK_DEAD_LINK_CODES = [
  'user_not_found',
  'users_not_found',
  'user_disabled',
  'cannot_dm_bot',
];

/**
 * A Slack `ok: false`. The `code` is what makes this worth a class - delivery has to tell
 * "this workspace is gone" apart from "this person left" apart from "try again", and Slack
 * only distinguishes them in that string.
 */
export class SlackApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly code: string,
  ) {
    super(`Slack ${method} failed: ${code}`);
    this.name = 'SlackApiError';
  }
}

export interface SlackIdentity {
  slackUserId: string;
  slackHandle?: string;
  /** Optional because nothing here requires it; the OAuth response is where the team is settled. */
  teamId?: string;
  teamName?: string;
}

export interface SlackMessage {
  /** What shows in the push notification, so it has to carry the whole point on its own. */
  text: string;
  blocks?: unknown[];
}

/**
 * Where a posted message ended up. The only address chat.update accepts, and the whole reason
 * postMessage hands anything back at all.
 */
export interface SlackMessageRef {
  channelId: string;
  messageTs: string;
}

@Injectable()
export class SlackApiService {
  private readonly logger = new Logger(SlackApiService.name);

  constructor(private readonly metrics: MetricsService) {}

  /** Who a user token belongs to. The only reason we ask for a user token at all. */
  public async readIdentity(userToken: string): Promise<SlackIdentity> {
    const data = await this.call('users.identity', userToken);

    return {
      // `ok: true` with no user id should not be possible, so this is not a fallback path - it
      // is a refusal to hand back an object whose type says `string` while holding undefined.
      slackUserId: this.required(data.user?.id, 'users.identity', 'missing_user_id'),
      slackHandle: data.user?.name,
      teamId: data.team?.id,
      teamName: data.team?.name,
    };
  }

  /**
   * The DM channel with one person. Idempotent on Slack's side - calling it twice returns the
   * same channel - but it still costs a request, which is why the id is cached on the link.
   */
  public async openDirectMessage(botToken: string, slackUserId: string): Promise<string> {
    const data = await this.call('conversations.open', botToken, { users: slackUserId });

    // Without this the undefined travelled on into chat.postMessage as the channel, where Slack
    // answered with a far less obvious error than the one that actually happened.
    return this.required(data.channel?.id, 'conversations.open', 'missing_channel_id');
  }

  /**
   * Asserts a field Slack's contract promises but its response did not carry.
   *
   * Raised as a SlackApiError rather than a plain one so it travels the same path as every other
   * Slack failure: delivery already knows how to classify those, and a malformed response lands
   * as `failed` rather than as an unhandled exception.
   */
  private required(value: string | undefined, method: string, code: string): string {
    if (!value) {
      throw new SlackApiError(method, code);
    }

    return value;
  }

  /**
   * Undefined where Slack answered `ok: true` without saying where it put the message.
   *
   * Not treated as a failure, unlike the missing ids above: the poke arrived, and all that is
   * lost is the ability to edit it later. Refusing a delivery that succeeded, to protect a
   * strikethrough that may never be needed, would be the wrong way round.
   */
  public async postMessage(
    botToken: string,
    channel: string,
    message: SlackMessage,
  ): Promise<SlackMessageRef | undefined> {
    const data = await this.call('chat.postMessage', botToken, {
      channel,
      text: message.text,
      blocks: message.blocks,
      // The message already links the pull request; letting Slack expand it as well turns a
      // one-line poke into half a screen.
      unfurl_links: false,
      unfurl_media: false,
    });

    return data.channel && data.ts ? { channelId: data.channel, messageTs: data.ts } : undefined;
  }

  /**
   * Rewrites a message proke already sent. A bot may edit its own messages for as long as they
   * exist, so an old review request is as editable as one from a minute ago.
   *
   * The whole message goes, blocks included, because chat.update replaces rather than merges -
   * omitting `blocks` would strip the message down to its fallback text.
   *
   * No unfurl flags: chat.update does not take them, and editing does not re-unfurl a link the
   * original message already declined to expand.
   */
  public async updateMessage(
    botToken: string,
    channelId: string,
    messageTs: string,
    message: SlackMessage,
  ): Promise<void> {
    await this.call('chat.update', botToken, {
      channel: channelId,
      ts: messageTs,
      text: message.text,
      blocks: message.blocks,
    });
  }

  /**
   * Every Slack Web API call. Two things make it unlike a normal fetch wrapper: failures come
   * back as HTTP 200 with `ok: false`, and rate limits come back as a 429 that is worth
   * sitting out exactly once.
   *
   * Timed at every exit, one record per HTTP request rather than per logical call - so a
   * rate-limited attempt and the retry behind it are two records, and the `rate_limited` count
   * is a straight count of 429s. Which matters more than it sounds: that path sleeps for up to
   * thirty seconds inside a handler and its only trace today is a warning in the log.
   */
  private async call(
    method: string,
    token: string,
    body: Record<string, unknown> = {},
    isRetry = false,
  ): Promise<any> {
    const startedAt = Date.now();
    const label = slackMethodLabel(method);
    let response: Response;

    try {
      response = await fetch(`${SLACK_API}/${method}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      // Slack unreachable. Recorded rather than left out: it is the one failure here that
      // produces no code at all, and so the one that would otherwise vanish completely.
      this.record(label, startedAt, 'error');
      throw error;
    }

    if (response.status === 429) {
      this.record(label, startedAt, 'rate_limited');

      if (!isRetry) {
        const wait = Math.min(Number(response.headers.get('retry-after') ?? 1), MAX_RETRY_SECONDS);
        this.logger.warn(`Rate limited on ${method}; retrying in ${wait}s`);
        await new Promise((resolve) => setTimeout(resolve, wait * 1000));

        return this.call(method, token, body, true);
      }

      throw new SlackApiError(method, `http_${response.status}`);
    }

    if (!response.ok) {
      this.record(label, startedAt, 'error');
      throw new SlackApiError(method, `http_${response.status}`);
    }

    const data = await response.json();

    if (!data?.ok) {
      const code = data?.error ?? 'unknown_error';
      this.record(label, startedAt, outcomeForCode(code));

      throw new SlackApiError(method, code);
    }

    this.record(label, startedAt, 'ok');

    return data;
  }

  private record(method: SlackMethod, startedAt: number, outcome: SlackOutcome): void {
    this.metrics.duration('proke.slack.request.duration', Date.now() - startedAt, {
      method,
      outcome,
    });
  }
}

/**
 * A Slack error code as one of the few things it can mean.
 *
 * Deliberately not the code itself. Slack's list is long and open-ended, and every unfamiliar
 * string it invents would otherwise become a permanent series - which is the same failure as
 * putting a repository name on a metric, arriving by a route nobody expects.
 */
function outcomeForCode(code: string): SlackOutcome {
  if (SLACK_DEAD_WORKSPACE_CODES.includes(code)) {
    return 'dead_workspace';
  }

  if (SLACK_DEAD_LINK_CODES.includes(code)) {
    return 'dead_link';
  }

  return 'error';
}
