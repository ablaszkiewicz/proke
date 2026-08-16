import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * proke installed into one Slack workspace, and the bot token that lets it post there.
 *
 * The Slack half of `installations`: somebody - often an admin, not the person being poked -
 * decided the app may be here at all. On its own it pokes nobody; a SlackLink is what makes an
 * individual reachable.
 */
@Schema({ collection: 'slack-workspaces', timestamps: true })
export class SlackWorkspaceEntity {
  _id: Types.ObjectId;

  // Slack's workspace id (T0123ABCD). Every other Slack id in the system is only meaningful
  // relative to one of these, which is why it is the key.
  @Prop({ unique: true })
  teamId: string;

  @Prop()
  teamName: string;

  // The app's own user id in this workspace. Kept so delivery can recognise proke's own
  // messages, and because Slack asks for it in a few places.
  @Prop()
  botUserId: string;

  // xoxb-…, encrypted by TokenCipherService. Never normalized into anything that reaches an
  // API response - see SlackWorkspaceSerializer.
  @Prop()
  botToken: string;

  // The scopes the token actually carries. Slack grants what it grants, which is not always
  // what was asked for, and a missing scope shows up as a runtime error otherwise.
  @Prop()
  botScopes?: string;

  // The proke user who installed it. Display only - it confers no authority over the row.
  @Prop()
  installedByUserId?: string;

  // Set when Slack tells us the token is dead (app_uninstalled, tokens_revoked). The row is
  // kept rather than deleted so the dashboard can say "reconnect" instead of quietly
  // forgetting the workspace ever existed.
  @Prop({ type: Date })
  revokedAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type SlackWorkspaceDocument = HydratedDocument<SlackWorkspaceEntity>;

export const SlackWorkspaceSchema = SchemaFactory.createForClass(SlackWorkspaceEntity);
