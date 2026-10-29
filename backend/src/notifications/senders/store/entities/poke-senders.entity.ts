import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * How long an account is remembered for after it last poked somebody - and how long a row
 * nobody has poked in a while lives at all.
 *
 * Long enough to see a weekly release bot four times, short enough that a bot an organisation
 * has since uninstalled stops being suggested within the month.
 */
export const POKE_SENDERS_WINDOW_SECONDS = 30 * 24 * 60 * 60;

/**
 * The most accounts one row keeps.
 *
 * The bound on the row, and with the one row per person, the bound on the collection: it grows
 * with the number of people, never with the number of pokes. Plenty for the handful of machines
 * anybody's organisation runs, with room for the colleagues around them.
 */
export const POKE_SENDERS_MAX = 24;

/** One account, and how often it has poked one person lately. */
@Schema({ _id: false })
export class PokeSenderEntity {
  // Normalised - see normalizeAccountLogin - so it compares with the logins on the bot lists.
  @Prop()
  login: string;

  // The automatic idea, from the payload at the time: a GitHub App, or a login ending in `-bot`.
  // Kept rather than worked out again on read, because the `[bot]` that says which is gone from
  // the normalised login.
  @Prop()
  bot: boolean;

  // Every poke from them that got past this person's kinds and organisations - sent, or kept
  // back by their bot settings. What the list is ordered by.
  @Prop()
  count: number;

  // Of those, how many their bot settings kept back. The rest reached them.
  @Prop()
  held: number;

  @Prop({ type: Date })
  lastAt: Date;
}

export const PokeSenderSchema = SchemaFactory.createForClass(PokeSenderEntity);

/**
 * Who has been poking one person lately: the accounts behind their pokes, and how many each.
 *
 * ## One row per person, never per poke
 *
 * A row per poke, or per person and account, would grow with traffic - and the busiest bots are
 * exactly the ones that would make it grow. Here everything about one person is one document
 * with a bounded list in it, so the collection is as many rows as there are people who have been
 * poked this month, each a couple of kilobytes at most.
 *
 * Three things keep that true, all in the one write that counts a poke - see
 * PokeSenderStoreService.record: an account not seen for a month is dropped from the list, a
 * full list drops its least-poked person to make room, and a row nobody has written to for a
 * month is removed by the TTL below.
 *
 * Counted rather than logged on purpose: no repository, title or time of any one poke is kept,
 * only who and how many.
 */
@Schema({ collection: 'poke-senders' })
export class PokeSendersEntity {
  _id: Types.ObjectId;

  @Prop()
  userId: string;

  @Prop({ type: [PokeSenderSchema], default: undefined })
  senders?: PokeSenderEntity[];

  // Written by hand in the same update as the list rather than by `timestamps`, which would have
  // to be trusted to find its way into an update pipeline.
  @Prop({ type: Date })
  updatedAt: Date;
}

export type PokeSendersDocument = HydratedDocument<PokeSendersEntity>;

export const PokeSendersSchema = SchemaFactory.createForClass(PokeSendersEntity);

// One row per person, which is what lets the counting write be an upsert.
PokeSendersSchema.index({ userId: 1 }, { unique: true });

// A row that nothing has poked in a month holds nothing worth reading. The read filters the
// entries the same way, so a row waiting for the TTL monitor says the same as one already gone.
PokeSendersSchema.index({ updatedAt: 1 }, { expireAfterSeconds: POKE_SENDERS_WINDOW_SECONDS });
