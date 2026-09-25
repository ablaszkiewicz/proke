import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * One announcement having gone out: the migrations table.
 *
 * `startedAt` fixes the audience. Everybody whose Slack link is older gets the announcement, even
 * where the start that reaches them is a later one than the start that wrote this row; anybody
 * who connects afterwards does not.
 *
 * `completedAt` is set once a pass has been through the whole audience, so later starts skip the
 * announcement without reading a single link.
 */
@Schema({ collection: 'announcement-runs', timestamps: true })
export class AnnouncementRunEntity {
  _id: Types.ObjectId;

  @Prop({ unique: true })
  announcementId: string;

  @Prop({ type: Date })
  startedAt: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type AnnouncementRunDocument = HydratedDocument<AnnouncementRunEntity>;

export const AnnouncementRunSchema = SchemaFactory.createForClass(AnnouncementRunEntity);
