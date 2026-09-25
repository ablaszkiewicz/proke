import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * One person's copy of one announcement, written before it is sent.
 *
 * The row is the claim: whoever inserts it sends, so two replicas starting together cannot both
 * message somebody. `outcome` is filled in once Slack has answered. A row without one is a send
 * that died between the two, and it is deliberately not retried - it may well have arrived.
 */
@Schema({ collection: 'announcement-deliveries', timestamps: true })
export class AnnouncementDeliveryEntity {
  _id: Types.ObjectId;

  @Prop()
  announcementId: string;

  @Prop()
  userId: string;

  // A SlackDeliveryOutcome, stored as a plain string like every other closed set in this schema.
  @Prop()
  outcome?: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type AnnouncementDeliveryDocument = HydratedDocument<AnnouncementDeliveryEntity>;

export const AnnouncementDeliverySchema = SchemaFactory.createForClass(AnnouncementDeliveryEntity);

// The claim. One copy per person per announcement.
AnnouncementDeliverySchema.index({ announcementId: 1, userId: 1 }, { unique: true });

// Deleting an account's rows.
AnnouncementDeliverySchema.index({ userId: 1 });
