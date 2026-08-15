import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'installations', timestamps: true })
export class InstallationEntity {
  _id: Types.ObjectId;

  // GitHub's installation id, stringified. One per account the app is installed on.
  @Prop({ unique: true })
  installationId: string;

  // The org or user the app is installed on.
  @Prop()
  accountId: string;

  @Prop()
  accountLogin: string;

  @Prop()
  accountType: string;

  // 'all' or 'selected' - whether the install covers every repo in the account or a subset.
  @Prop()
  repositorySelection: string;

  // Set when the account suspends the app: it stays installed but stops delivering events.
  @Prop({ type: Date })
  suspendedAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type InstallationDocument = HydratedDocument<InstallationEntity>;

export const InstallationSchema = SchemaFactory.createForClass(InstallationEntity);
