import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { getEnvConfig } from '../../shared/configs/env-configs';

const MAX_AGE_MS = 10 * 60 * 1000;

/**
 * The `state` proke sends Slack and gets back, binding the round trip to one user.
 *
 * Signed rather than stored, so there is no server-side session to keep, and deliberately not
 * a JWT: state travels in a URL, through Slack's logs and a browser's history, and the auth
 * token format must never be something that can leak from there and then be replayed as a
 * bearer token.
 *
 * Signed with its own secret for the same reason. Sharing the JWT key would have meant one
 * rotation silently voiding every Slack authorization in flight, and any weakness in either
 * context reaching the other.
 */
@Injectable()
export class SlackStateService {
  public sign(userId: string): string {
    const payload = `${userId}.${Date.now()}`;

    return `${Buffer.from(payload).toString('base64url')}.${this.digest(payload)}`;
  }

  /** The user this state was minted for, or null if it is forged, malformed or stale. */
  public verify(state: string): string | null {
    const [encoded, signature] = (state ?? '').split('.');

    if (!encoded || !signature) {
      return null;
    }

    const payload = Buffer.from(encoded, 'base64url').toString('utf8');
    const expected = this.digest(payload);

    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null;
    }

    const [userId, issuedAt] = payload.split('.');

    if (!userId || Date.now() - Number(issuedAt) > MAX_AGE_MS) {
      return null;
    }

    return userId;
  }

  private digest(payload: string): string {
    return createHmac('sha256', getEnvConfig().auth.stateSigningSecret)
      .update(payload)
      .digest('hex');
  }
}
