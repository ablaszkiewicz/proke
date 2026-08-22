import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { InboxSectionContent } from './inbox.interface';

/**
 * How long a snapshot outlives the last person who wanted it.
 *
 * Not a cache expiry - the endpoint has its own, shorter idea of stale. This is a floor sweep:
 * somebody who signed in once and never came back should not leave a document behind forever,
 * and a stale row costs nothing to rebuild the next time they appear.
 */
const RETENTION_SECONDS = 30 * 24 * 60 * 60;

/**
 * One person's inbox, computed and set aside.
 *
 * Mongo rather than the in-process cache, and deliberately: the point of this row is to be warm
 * when nobody has asked yet. A refresher running every minute writes it, a restart must not lose
 * it, and a second replica has to see what the first one wrote. InMemoryCacheService is
 * documented as authoritative for nothing, which is the opposite of what this needs to be.
 *
 * The sections are stored whole. They are written and read as one object, never queried into,
 * so normalising them into their own collection would buy a join and nothing else.
 */
@Schema({ collection: 'inbox-snapshots', timestamps: true })
export class InboxSnapshotEntity {
  _id: Types.ObjectId;

  @Prop({ unique: true })
  userId: string;

  /** When GitHub last answered - not when this document was written. They differ on a retry. */
  @Prop({ type: Date })
  refreshedAt: Date;

  @Prop({ type: [Object], default: [] })
  yours: InboxSectionContent[];

  @Prop({ type: [Object], default: [] })
  waitingOnYou: InboxSectionContent[];

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type InboxSnapshotDocument = HydratedDocument<InboxSnapshotEntity>;

export const InboxSnapshotSchema = SchemaFactory.createForClass(InboxSnapshotEntity);

// On updatedAt, so a snapshot that is still being refreshed never ages out from under its owner.
InboxSnapshotSchema.index({ updatedAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });
