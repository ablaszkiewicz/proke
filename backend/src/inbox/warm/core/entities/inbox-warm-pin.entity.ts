import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * One set of build filters somebody has asked to be kept ready.
 *
 * Only the build filters, and that is the whole shape of this feature rather than a
 * simplification of it. A snapshot is filed under `inboxFiltersKey(buildFilters)` and view
 * filters are applied to it on the way out - see inbox-store.service.ts - so warming one build
 * key makes every view-filter variation on top of it instant too. A pin carrying
 * `ignoredAuthors` would be storing something that changes nothing about what is warmed.
 */
@Schema({ _id: false })
export class WarmPinEntity {
  /**
   * The canonical key from `inboxFiltersKey`, stored purely as a dedup token.
   *
   * A plain string Mongo can compare exactly, where an `$elemMatch` over several optional
   * fields would silently miss a pin written before one of them existed - and a missed match is
   * a duplicate pin, which is a wasted GitHub call every five minutes forever.
   *
   * Never read as the cache key. That is always recomputed from the normalized filters below,
   * so a pin written by an older deploy still warms the right key.
   */
  @Prop()
  key: string;

  // The filters themselves, because InboxRefreshService takes them structured. Optional, and
  // filled in from DEFAULT_BUILD_FILTERS on read - the same trick normalizePreferences uses in
  // subscriptions, and the reason adding a third build filter needs no migration.
  @Prop()
  includeApproved?: boolean;

  @Prop()
  recentDrafts?: string;

  @Prop({ type: Date })
  pinnedAt: Date;
}

export const WarmPinSchema = SchemaFactory.createForClass(WarmPinEntity);

/**
 * Every view one person has asked to be kept ready, in one document.
 *
 * One document per user rather than one per pin, and the cap is the reason. `MAX_WARM_PINS` is
 * a per-user count, and a per-user count is only enforceable atomically where the things being
 * counted sit in a single document: one-row-per-pin needs a count followed by an insert, which
 * two presses in two tabs both pass.
 *
 * Kept in Mongo rather than in the process cache, unlike the snapshots this feature exists to
 * warm. A snapshot is a copy of something GitHub can be asked for again; a pin is somebody's
 * stated choice and exists nowhere else, so it is exactly the kind of thing
 * InMemoryCacheService refuses to hold.
 */
@Schema({ collection: 'inboxWarmPins', timestamps: true })
export class InboxWarmPinEntity {
  _id: Types.ObjectId;

  @Prop()
  userId: string;

  // Absent rather than empty for a user who has removed their last pin, so the two are one
  // state rather than two. `default: undefined` keeps Mongoose from writing `[]` on insert.
  @Prop({ type: [WarmPinSchema], default: undefined })
  pins?: WarmPinEntity[];

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type InboxWarmPinDocument = HydratedDocument<InboxWarmPinEntity>;

export const InboxWarmPinSchema = SchemaFactory.createForClass(InboxWarmPinEntity);

/**
 * One document per user, and the thing that makes the cap race-proof.
 *
 * InboxWarmWriteService adds a pin with a guarded upsert: when the guard fails because the
 * document is full or already holds the key, Mongo falls through to an insert and this index
 * rejects it. The duplicate-key error *is* the concurrency check - there is no read-then-write
 * to lose a race in.
 */
InboxWarmPinSchema.index({ userId: 1 }, { unique: true });
