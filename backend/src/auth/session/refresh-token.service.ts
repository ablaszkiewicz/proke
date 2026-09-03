import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { getEnvConfig } from '../../shared/configs/env-configs';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

/** 32 random bytes, base64url. Opaque - it carries no claims, it is only a key to a row. */
const TOKEN_BYTES = 32;

export interface IssuedRefreshToken {
  /** The secret the client keeps. This is the only moment it exists outside the browser. */
  token: string;
  expiresAt: Date;
}

/**
 * The store behind the long half of a session.
 *
 * Read and write in one service rather than split the way the user and subscription modules are.
 * The interesting operation here is `redeem`, which checks a token and extends it in the same
 * atomic update; separating the two would mean a read service that reports a session valid and
 * a write service that has to trust it, with a window in between.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectModel(RefreshTokenEntity.name)
    private readonly refreshTokenModel: Model<RefreshTokenEntity>,
  ) {}

  public async issue(userId: string): Promise<IssuedRefreshToken> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = this.nextExpiry();

    await this.refreshTokenModel.create({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      lastUsedAt: new Date(),
    });

    return { token, expiresAt };
  }

  /**
   * Spends a refresh token and pushes its expiry out, or answers null if there is nothing to
   * spend - unknown, already revoked, or lapsed.
   *
   * Deliberately does *not* rotate: the same secret comes back valid. Rotation would be the
   * stricter choice, and it is the wrong one for a browser that keeps its session in local
   * storage and can have proke open in four tabs. Each tab holds its own copy in memory, so the
   * first one to rotate would invalidate the token the other three are still holding, and they
   * would all be signed out mid-scroll. What rotation buys - noticing a stolen token when the
   * thief and the owner both use it - is worth less here than not logging people out of their
   * own tabs. Revocation is what carries the weight instead, and that works either way.
   *
   * One findOneAndUpdate rather than a read and then a write, so two tabs refreshing at the
   * same instant cannot both pass a check that only one of them should.
   */
  public async redeem(token: string): Promise<{ userId: string; expiresAt: Date } | null> {
    const now = new Date();
    const expiresAt = this.nextExpiry(now);

    const session = await this.refreshTokenModel
      .findOneAndUpdate(
        // The expiry is part of the match, not something checked afterwards: the TTL index
        // sweeps on its own schedule, so an expired row is routinely still there to be found.
        { tokenHash: hashToken(token), expiresAt: { $gt: now } },
        { $set: { expiresAt, lastUsedAt: now } },
      )
      .lean<RefreshTokenEntity>()
      .exec();

    if (!session) {
      return null;
    }

    // The document as it was before the update - the default, and all that is wanted here. The
    // new expiry is the one just computed above, so there is nothing to read back for it.
    return { userId: session.userId, expiresAt };
  }

  /** Ends one session. What signing out does, and the reason the row exists at all. */
  public async revoke(token: string): Promise<void> {
    await this.refreshTokenModel.deleteOne({ tokenHash: hashToken(token) });
  }

  /** Ends every session this user has. Part of deleting an account. */
  public async revokeForUser(userId: string): Promise<void> {
    await this.refreshTokenModel.deleteMany({ userId });
  }

  private nextExpiry(from: Date = new Date()): Date {
    return new Date(from.getTime() + getEnvConfig().auth.refreshTokenTtlMs);
  }
}

/**
 * Plain SHA-256, no salt and no work factor, and that is right here rather than sloppy: unlike a
 * password this is 32 bytes of CSPRNG output, so there is no dictionary to run and nothing to
 * slow down. The hash exists so a leaked database is not a drawer of live sessions.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
