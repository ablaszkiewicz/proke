import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { getEnvConfig } from '../../shared/configs/env-configs';

@Injectable()
export class GithubWebhookSignatureService {
  /**
   * Verifies X-Hub-Signature-256 over the *raw* body. It has to be the exact bytes GitHub
   * sent - re-serializing the parsed JSON reorders keys and changes whitespace, which changes
   * the digest, so main.ts enables rawBody and the controller reads req.rawBody.
   */
  public verify(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
    const { webhookSecret } = getEnvConfig().githubApp;

    // Refuse rather than skip verification: an unset secret in production would otherwise
    // silently accept anything the internet posts at us.
    if (!webhookSecret || !rawBody || !signatureHeader) {
      return false;
    }

    const expected =
      'sha256=' + createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(signatureHeader);

    // timingSafeEqual throws on length mismatch, so check that first.
    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, receivedBuffer);
  }
}
