import { Injectable, Logger } from '@nestjs/common';

const SLACK_API = 'https://slack.com/api';
// One retry only, and never a long one: a webhook has already been acknowledged by the time we
// get here, so a slow poke costs nothing, but an unbounded wait would pile up handlers.
const MAX_RETRY_SECONDS = 30;

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
  teamId: string;
  teamName?: string;
}

export interface SlackMessage {
  /** What shows in the push notification, so it has to carry the whole point on its own. */
  text: string;
  blocks?: unknown[];
}

@Injectable()
export class SlackApiService {
  private readonly logger = new Logger(SlackApiService.name);

  /** Who a user token belongs to. The only reason we ask for a user token at all. */
  public async readIdentity(userToken: string): Promise<SlackIdentity> {
    const data = await this.call('users.identity', userToken);

    return {
      slackUserId: data.user?.id,
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

    return data.channel?.id;
  }

  public async postMessage(
    botToken: string,
    channel: string,
    message: SlackMessage,
  ): Promise<void> {
    await this.call('chat.postMessage', botToken, {
      channel,
      text: message.text,
      blocks: message.blocks,
      // The message already links the pull request; letting Slack expand it as well turns a
      // one-line poke into half a screen.
      unfurl_links: false,
      unfurl_media: false,
    });
  }

  /**
   * Every Slack Web API call. Two things make it unlike a normal fetch wrapper: failures come
   * back as HTTP 200 with `ok: false`, and rate limits come back as a 429 that is worth
   * sitting out exactly once.
   */
  private async call(
    method: string,
    token: string,
    body: Record<string, unknown> = {},
    isRetry = false,
  ): Promise<any> {
    const response = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429 && !isRetry) {
      const wait = Math.min(Number(response.headers.get('retry-after') ?? 1), MAX_RETRY_SECONDS);
      this.logger.warn(`Rate limited on ${method}; retrying in ${wait}s`);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));

      return this.call(method, token, body, true);
    }

    if (!response.ok) {
      throw new SlackApiError(method, `http_${response.status}`);
    }

    const data = await response.json();

    if (!data?.ok) {
      throw new SlackApiError(method, data?.error ?? 'unknown_error');
    }

    return data;
  }
}
