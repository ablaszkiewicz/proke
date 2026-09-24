import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { GithubNotificationNormalized } from '../../../core/entities/github-notification.interface';
import { PokeMessageReviewer } from './poke-message.interface';

/**
 * How long a review request stays editable.
 *
 * Not a retention policy - it is how long the strikethrough is still worth applying. A request
 * that has sat unanswered for two days has already been chased somewhere else, and quietly
 * editing a message that far down somebody's Slack is noise rather than news.
 */
const RESOLVABLE_SECONDS = 48 * 60 * 60;

/**
 * A poke we may need to go back and edit.
 *
 * Only review requests are kept, because they are the only poke whose truth expires: everything
 * else proke sends is news about something that already happened, and a merge does not stop
 * having been a merge. A review request, by contrast, says "this is waiting on you" - and the
 * moment somebody reviews the pull request, that message is a small lie sitting in a DM.
 *
 * The row exists to answer one question - which Slack message was that, and whose - so it holds
 * the message's address and enough of the original notification to render it a second time.
 * Rows are deleted the moment the request is settled; the TTL only catches the ones nothing
 * ever settled. A review that reached no verdict is written onto the row rather than ending it,
 * because it leaves the request standing.
 *
 * One row per message, not per person. Somebody asked through their team and then by name too
 * far apart to be batched has two messages about one request, and whatever settles it has to
 * reach both - the one left standing reads as a review still owed.
 */
@Schema({ collection: 'poke-messages', timestamps: true })
export class PokeMessageEntity {
  _id: Types.ObjectId;

  @Prop()
  userId: string;

  /**
   * Carried rather than looked up, so deciding "did this person review it themselves?" costs
   * nothing. Webhooks name the reviewer by id, and comparing ids is the only comparison that
   * stays true across a rename.
   */
  @Prop()
  userGithubId?: string;

  // The workspace, because the token allowed to edit the message is scoped to it - and the
  // user's link may have moved to a different workspace by the time the review lands.
  @Prop()
  teamId: string;

  @Prop()
  channelId: string;

  // Slack's message id, and the second half of the only address chat.update accepts.
  @Prop()
  messageTs: string;

  @Prop()
  repositoryFullName: string;

  @Prop()
  pullRequestNumber: number;

  /**
   * The poke as it was rendered from, kept whole so the edit can rebuild the same message with
   * one line struck through instead of reconstructing a title, a diff and an avatar from
   * columns. Denormalised on purpose: a pull request renamed after the poke went out should not
   * silently rewrite what the poke said at the time.
   */
  @Prop({ type: Object })
  notification: GithubNotificationNormalized;

  /**
   * Whoever has reviewed without deciding since the poke went out, in the order they did. The
   * message names all of them, so the second one has to be added to the first rather than
   * written over them - and the row is the only place the first one is still known.
   *
   * Absent rather than empty until somebody has, like every other optional thing on a row that
   * predates the field.
   */
  @Prop({ type: [Object], default: undefined })
  reviewers?: PokeMessageReviewer[];

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type PokeMessageDocument = HydratedDocument<PokeMessageEntity>;

export const PokeMessageSchema = SchemaFactory.createForClass(PokeMessageEntity);

// The lookup every resolution does: everybody still waiting on this pull request.
PokeMessageSchema.index({ repositoryFullName: 1, pullRequestNumber: 1 });

// Deleting an account's rows, which the unique index this replaced used to serve as a prefix.
PokeMessageSchema.index({ userId: 1 });

// On updatedAt, from when a re-request rewrote the row and had to restart the clock. Nothing
// moves it now that every message has a row of its own, so it reads the same as createdAt - and
// moving the index would mean rebuilding it for no change at all.
PokeMessageSchema.index({ updatedAt: 1 }, { expireAfterSeconds: RESOLVABLE_SECONDS });
