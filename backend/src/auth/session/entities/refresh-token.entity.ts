import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * One long-lived session: the half of a login that can be taken away again.
 *
 * The access token it mints is a signed JWT and therefore beyond recall - the guard checks a
 * signature and nothing else - so everything that has to be revocable lives here instead. A row
 * per session rather than a counter on the user, so signing out of a laptop leaves the phone
 * signed in.
 *
 * The secret handed to the browser is never stored. Only its SHA-256 is, so a dump of this
 * collection is a list of hashes rather than a drawer of working sessions - the same reason a
 * password table holds hashes. It is not encrypted the way the GitHub token is, because nothing
 * ever needs to read this value back: a presented token is hashed and looked up, never decrypted.
 */
@Schema({ collection: 'refresh_tokens', timestamps: true })
export class RefreshTokenEntity {
  _id: Types.ObjectId;

  @Prop()
  userId: string;

  // SHA-256 of the token, hex. Unique because a collision would be two sessions answering to
  // one secret, and plain (not `sparse`) because every row has one.
  @Prop({ unique: true })
  tokenHash: string;

  // Pushed forward on every use - see RefreshTokenService.redeem. Read as part of the lookup
  // rather than trusted to the TTL index below, which sweeps on a timer and is therefore about
  // storage rather than about correctness.
  @Prop({ type: Date })
  expiresAt: Date;

  // Only for looking at. Nothing branches on it; it is here so that "when was this session last
  // alive" is answerable at all.
  @Prop({ type: Date })
  lastUsedAt: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type RefreshTokenDocument = HydratedDocument<RefreshTokenEntity>;

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshTokenEntity);

// Mongo deletes rows once expiresAt is in the past, so an abandoned session costs nothing
// forever. Housekeeping only: every read already excludes expired rows itself, because the TTL
// monitor runs about once a minute and "about" is not a thing to authenticate on.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Ending every session at once - signing out everywhere, deleting an account - is a query on
// this and nothing else.
RefreshTokenSchema.index({ userId: 1 });
