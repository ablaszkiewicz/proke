import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { getEnvConfig } from '../../shared/configs/env-configs';

const VERSION = 'v0';
// Slack's own recommendation. Bounds how long a captured request stays replayable.
const MAX_SKEW_SECONDS = 60 * 5;

/**
 * Verifies that an Events API request really came from Slack.
 *
 * Same job as the GitHub webhook signature, with one addition: the timestamp is part of what
 * is signed and is checked separately, so an intercepted request cannot be replayed a day
 * later with a still-valid signature.
 */
@Injectable()
export class SlackSignatureService {
  private readonly logger = new Logger(SlackSignatureService.name);

  public verify(
    rawBody: Buffer | undefined,
    timestamp: string | undefined,
    signature: string | undefined,
  ): boolean {
    const secret = getEnvConfig().slack.signingSecret;

    if (!secret) {
      this.logger.warn('SLACK_SIGNING_SECRET is not set - rejecting the Slack event');
      return false;
    }

    if (!rawBody || !timestamp || !signature) {
      return false;
    }

    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) {
      this.logger.warn('Rejecting a Slack event with a stale timestamp');
      return false;
    }

    const expected = `${VERSION}=${createHmac('sha256', secret)
      .update(`${VERSION}:${timestamp}:${rawBody.toString('utf8')}`)
      .digest('hex')}`;

    if (signature.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
}
