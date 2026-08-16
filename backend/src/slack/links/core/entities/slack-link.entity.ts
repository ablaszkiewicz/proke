import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * One proke user, as they exist inside one Slack workspace.
 *
 * The Slack half of `subscriptions`: the workspace install is somebody else's decision, and
 * this row is the user's own - it is what makes them addressable, and deleting it is how they
 * stop being poked in Slack.
 *
 * It has to be a pair, not a field on the user, because a Slack user id means nothing on its
 * own: U04AB in one workspace and U04AB in another are unrelated people, and the token allowed
 * to message either of them is scoped to that workspace too.
 */
@Schema({ collection: 'slack-links', timestamps: true })
export class SlackLinkEntity {
  _id: Types.ObjectId;

  @Prop({ index: true })
  userId: string;

  @Prop()
  teamId: string;

  // Carried alongside so the dashboard can name the workspace even when proke is not installed
  // in it yet and there is no SlackWorkspace row to read the name from.
  @Prop()
  teamName?: string;

  @Prop()
  slackUserId: string;

  // Display only, and free to change - the identity is slackUserId.
  @Prop()
  slackHandle?: string;

  // The DM conversation with this person. Stable once opened, so caching it here turns every
  // later poke into a single Slack call instead of two.
  @Prop()
  dmChannelId?: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type SlackLinkDocument = HydratedDocument<SlackLinkEntity>;

export const SlackLinkSchema = SchemaFactory.createForClass(SlackLinkEntity);

// One identity per person per workspace. The pair rather than userId alone, so a second
// workspace is a schema change away rather than an index migration.
SlackLinkSchema.index({ userId: 1, teamId: 1 }, { unique: true });
