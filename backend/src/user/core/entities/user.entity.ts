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

  // The @handle, as GitHub cases it. Display only - it changes whenever the user renames
  // themselves, so githubId stays the identity.
  @Prop()
  githubLogin?: string;

  // The same handle, lowercased, and the field mention routing actually queries. GitHub treats
  // handles case-insensitively, so this is what makes that an indexed equality rather than a
  // case-insensitive regex, which Mongo cannot serve from an index at all.
  //
  // Unique because GitHub itself guarantees one live owner per handle. Two rows claiming one
  // handle only ever means a stale row left behind by a rename, and that is exactly the state
  // that used to let a poke - repository name, title, and a slice of the comment - land on
  // whoever the unordered findOne happened to return. UserWriteService releases the handle from
  // any other row before claiming it here, which is what keeps this index satisfiable.
  @Prop({ unique: true, sparse: true })
  githubLoginLower?: string;

  // Kept for display and as the future join key to other platforms. Optional: GitHub only
  // hands one over if the user has a verified primary address.
  @Prop()
  email?: string;

  @Prop()
  authMethod?: AuthMethod;

  @Prop()
  avatarUrl?: string;

  // The GitHub App user-to-server token. Notifications arrive by webhook, so this is only used
  // to ask GitHub which installations the user can reach and what their role in an org is.
  //
  // Encrypted at rest by TokenCipherService, the same key that guards the Slack bot tokens, and
  // deliberately absent from UserSerializer.serialize() so it can never leave through the API.
  // Encrypted regardless of how narrow today's scopes are: the app's user permissions are
  // widened on GitHub's settings page, not in this file, so nobody making that change would
  // ever see a note here telling them to come back and encrypt it.
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
