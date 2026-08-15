import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * A per-repository exception to the installation-wide defaults.
 *
 * Keyed on GitHub's numeric repository id rather than the full name, because a repository that
 * is renamed or moved between orgs keeps its id and would otherwise silently lose its settings.
 * The full name is carried alongside purely so the UI can render a row without a GitHub call.
 */
@Schema({ _id: false })
export class RepositoryPreferenceEntity {
  @Prop()
  repositoryId: string;

  @Prop()
  repositoryFullName?: string;

  // Under `all` scope, false mutes this repository. Under `selected` scope, only repositories
  // listed here with true are covered at all.
  @Prop()
  enabled: boolean;

  // Absent means "inherit the installation-wide list". An empty array is a real answer - the
  // user turned everything off for this repository - so the two must stay distinguishable.
  @Prop({ type: [String], default: undefined })
  notificationTypes?: string[];
}

export const RepositoryPreferenceSchema =
  SchemaFactory.createForClass(RepositoryPreferenceEntity);

/**
 * One user opting in to one installation, plus everything they want out of it.
 *
 * Installing the app is an org-level act, usually by somebody else; this row is the per-user
 * consent to actually be poked about it, and the per-user shape of those pokes.
 *
 * The preference fields are deliberately richer than any UI exposes today: the model can
 * already express "only these repos, and only merges on that one". The frontend just writes
 * the defaults and shows them as read-only.
 */
@Schema({ collection: 'subscriptions', timestamps: true })
export class SubscriptionEntity {
  _id: Types.ObjectId;

  @Prop()
  userId: string;

  @Prop()
  installationId: string;

  // 'all' | 'selected' - see RepositoryScope. Rows written before preferences existed have
  // neither this nor the fields below; normalizePreferences fills them in on read, which is
  // why no migration was needed.
  @Prop()
  repositoryScope?: string;

  // The installation-wide default, applied to every repository without an override.
  @Prop({ type: [String], default: undefined })
  notificationTypes?: string[];

  @Prop({ type: [RepositoryPreferenceSchema], default: undefined })
  repositories?: RepositoryPreferenceEntity[];

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type SubscriptionDocument = HydratedDocument<SubscriptionEntity>;

export const SubscriptionSchema = SchemaFactory.createForClass(SubscriptionEntity);

// A user subscribes to an installation at most once. Also the index the webhook router hits
// on every delivery.
SubscriptionSchema.index({ userId: 1, installationId: 1 }, { unique: true });
