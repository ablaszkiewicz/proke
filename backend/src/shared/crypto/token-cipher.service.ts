import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { getEnvConfig } from '../configs/env-configs';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
// Stamped on every ciphertext so the key can be rotated later without guessing what a stored
// string was encrypted with. Anything without the stamp is read back as plaintext.
const VERSION = 'v1';

/**
 * Encrypts the third-party tokens we have to keep - Slack bot tokens and GitHub user tokens.
 * Authenticated (GCM), so a tampered row fails to decrypt rather than yielding a token that is
 * subtly wrong.
 *
 * Deliberately tolerant on the way in: a value with no version prefix is returned untouched,
 * which is what makes turning this on for an existing collection a no-op rather than a
 * migration.
 */
@Injectable()
export class TokenCipherService {
  private readonly logger = new Logger(TokenCipherService.name);
  private warned = false;

  public encrypt(plaintext: string): string {
    if (!plaintext) {
      return plaintext;
    }

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [
      VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join('.');
  }

  public decrypt(value: string): string {
    if (!value || !value.startsWith(`${VERSION}.`)) {
      return value;
    }

    const [, iv, tag, ciphertext] = value.split('.');
    const decipher = createDecipheriv(ALGORITHM, this.key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /**
   * Hashed rather than used raw, so the configured secret can be any length or shape and still
   * produce the 32 bytes AES-256 needs.
   */
  private key(): Buffer {
    const configured = getEnvConfig().crypto.tokenEncryptionKey;

    if (configured.startsWith('local-development') && !this.warned) {
      this.warned = true;
      this.logger.warn(
        'TOKEN_ENCRYPTION_KEY is unset - Slack bot tokens and GitHub user tokens are ' +
          'being encrypted with a key that is in the source. Set it before storing anyone ' +
          'else’s credentials. Production refuses to start without it; see assertProductionEnv.',
      );
    }

    return createHash('sha256').update(configured).digest();
  }
}
