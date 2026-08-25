import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InboxBuildFilters, inboxFiltersKey } from '../../core/entities/inbox-filters.interface';
import { InboxWarmPinEntity } from '../core/entities/inbox-warm-pin.entity';
import {
  InboxWarmPin,
  MAX_WARM_PINS,
  normalizeWarmPins,
} from '../core/entities/inbox-warm-pin.interface';

/**
 * Adding a pin either worked or the person is already holding as many as they may.
 *
 * Both answers carry the resulting list, because the caller's next move is the same either way:
 * tell the client what is actually pinned now. A failure that answered with nothing would leave
 * a client that had already moved its switch with no way back to the truth.
 */
export type WarmPinAddResult =
  { ok: true; pins: InboxWarmPin[] } | { ok: false; reason: 'at-capacity'; pins: InboxWarmPin[] };

@Injectable()
export class InboxWarmWriteService {
  constructor(
    @InjectModel(InboxWarmPinEntity.name)
    private readonly warmPinModel: Model<InboxWarmPinEntity>,
  ) {}

  /**
   * Keeps one set of build filters ready, if there is room.
   *
   * ## Why this is one guarded upsert rather than a read and a write
   *
   * The cap is the only interesting thing here, and a count followed by an insert loses to two
   * presses in two tabs: both read two, both write, and the person ends up with four views being
   * refreshed every five minutes. So the count is part of the filter, and the whole thing is one
   * statement Mongo either matches or does not.
   *
   * ## Why the count is `pins.2` rather than a size comparison
   *
   * Because the obvious spelling is refused: `$expr` - which is what `$size` needs to be
   * compared against a number - is not allowed in the query predicate of an upsert, and Mongo
   * says so with error 224 rather than by quietly doing something else.
   *
   * `pins.<MAX - 1>` does not exist exactly when the array is shorter than the cap, which is the
   * same question asked in a way an upsert predicate accepts. Derived from MAX_WARM_PINS rather
   * than written as a literal `pins.2`, so raising the cap is one constant and not two.
   *
   * ## Why the failure path is a duplicate-key error
   *
   * Because the guard is in the filter, a document that is full, or that already holds this key,
   * simply does not match - and an upsert that matches nothing inserts. The unique index on
   * `userId` refuses that insert, which is precisely the signal wanted: the write did not
   * happen, and it did not happen for one of two reasons that the list itself then tells apart.
   *
   * That is also why nothing here is idempotency-checked in advance. Pressing a switch that is
   * already on takes the same path as pressing one at capacity, and both end in a read.
   *
   * There is deliberately no `$setOnInsert` for `userId`. The filter has it as an equality, so
   * Mongo builds it into the inserted document itself.
   */
  public async add(userId: string, filters: InboxBuildFilters): Promise<WarmPinAddResult> {
    const key = inboxFiltersKey(filters);

    try {
      await this.warmPinModel.updateOne(
        {
          userId,
          'pins.key': { $ne: key },
          // Neither this nor the clause above is an equality, so neither is built into the
          // document an upsert inserts - which is what makes a first pin land correctly rather
          // than writing a `pins` field shaped like the query.
          [`pins.${MAX_WARM_PINS - 1}`]: { $exists: false },
        },
        {
          $push: {
            pins: {
              key,
              includeApproved: filters.includeApproved,
              recentDrafts: filters.recentDrafts,
              pinnedAt: new Date(),
            },
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
      // The document exists and the guard rejected it. Which of the two reasons that was is
      // answerable from the list, below, and nowhere else.
    }

    const pins = await this.read(userId);

    // Present means it worked, or was already true - and "already true" is a success, because
    // what the caller asked for is the state rather than the transition.
    return pins.some((pin) => pin.key === key)
      ? { ok: true, pins }
      : { ok: false, reason: 'at-capacity', pins };
  }

  /** Idempotent: removing something that is not pinned is a no-op that answers with the list. */
  public async remove(userId: string, filters: InboxBuildFilters): Promise<InboxWarmPin[]> {
    const document = await this.warmPinModel
      .findOneAndUpdate(
        { userId },
        { $pull: { pins: { key: inboxFiltersKey(filters) } } },
        { returnDocument: 'after' },
      )
      .lean<InboxWarmPinEntity>()
      .exec();

    return normalizeWarmPins(document?.pins);
  }

  /** For a user being deleted. See UserDeletionService. */
  public async deleteForUser(userId: string): Promise<void> {
    await this.warmPinModel.deleteMany({ userId });
  }

  private async read(userId: string): Promise<InboxWarmPin[]> {
    const document = await this.warmPinModel.findOne({ userId }).lean<InboxWarmPinEntity>().exec();

    return normalizeWarmPins(document?.pins);
  }
}

/** Mongo's unique-index rejection, whatever driver wrapper it arrives in. */
function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}
