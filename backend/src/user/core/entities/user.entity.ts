import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AuthMethod } from '../enum/auth-method.enum';

@Schema({ collection: 'users', timestamps: true })
export class UserEntity {
  _id: Types.ObjectId;

  // GitHub's numeric user id, as a string. This is the identity: it never changes and GitHub
  // never reuses it, unlike the email or the login. Sparse so pre-GitHub rows don't collide.
  @Prop({ unique: true, sparse: true })
  githubId?: string;

  // The @handle. Changes whenever the user renames themselves, so githubId stays the identity.
  // Looked up only for @mentions, where the payload gives us a handle and nothing else - and
  // refreshed on every login, so a rename costs at most the pokes between the two.
  @Prop({ index: true })
  githubLogin?: string;

  // Kept for display and as the future join key to other platforms. Optional: GitHub only
  // hands one over if the user has a verified primary address.
  @Prop()
  email?: string;

  @Prop()
  authMethod?: AuthMethod;

  @Prop()
  avatarUrl?: string;

  // The OAuth App token. Notifications arrive by webhook now, so this is only used to ask
  // GitHub which orgs the user belongs to when rendering the connections page. Deliberately
  // absent from UserSerializer.serialize() so it can never leave through the API. Plaintext is
  // acceptable at `read:org`; encrypt at rest before anything asks for `repo`.
  @Prop()
  githubAccessToken?: string;

  @Prop({ type: Date })
  lastActivityDate: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserEntity>;

export const UserSchema = SchemaFactory.createForClass(UserEntity);
