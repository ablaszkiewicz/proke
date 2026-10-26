import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  InboxFilters,
  normalizeInboxSettings,
} from '../../inbox/core/entities/inbox-filters.interface';
import { normalizeAccountLogin } from '../../notifications/core/bot-accounts';
import { normalizePokeSettings } from '../../notifications/core/poke-settings';
import { InMemoryCacheService } from '../../shared/cache/in-memory-cache.service';
import { TokenCipherService } from '../../shared/crypto/token-cipher.service';
import { isTimezone } from '../../shared/time/local-day';
import { UserEntity } from '../core/entities/user.entity';
import { UserNormalized } from '../core/entities/user.interface';
import { UserSerializer } from '../core/entities/user.serializer';

/**
 * How long "has anybody allowed this bot" is believed. A minute, so somebody who has just added a
 * bot to their allowed bots hears from it within one - and so a bot that comments on every
 * push costs one query a minute rather than one a comment.
 */
const COUNTED_AS_PERSON_TTL_MS = 60_000;

/** One person the warmer should build an inbox for, and the settings to build it under. */
export interface InboxWarmTarget {
  userId: string;
  settings: InboxFilters;
}

/** One person who has asked for a digest, and what it takes to decide whether one is due. */
export interface DigestTarget {
  userId: string;
  timezone: string;
  hour: number;
  /** The local day their last digest was claimed for. The claim still decides; this saves a write. */
  sentOn?: string;
  /** Their inbox settings, so the digest lists what their inbox would. */
  settings: InboxFilters;
}

@Injectable()
export class UserReadService {
  constructor(
    @InjectModel(UserEntity.name) private userModel: Model<UserEntity>,
    private readonly tokenCipher: TokenCipherService,
    private readonly cache: InMemoryCacheService,
  ) {}

  public async readByIdOrThrow(id: string): Promise<UserNormalized> {
    const user = await this.readById(id);

    if (!user) {
      throw new NotFoundException(`User not found`);
    }

    return user;
  }

  /**
   * Null where there is no such user. For the paths that hold a user id off a row of their own
   * and have a sensible answer to it having gone stale - unlike a request on their behalf,
   * which has none and throws above.
   */
  public async readById(id: string): Promise<UserNormalized | null> {
    const user = await this.userModel.findById(id).lean<UserEntity>().exec();

    return user ? this.normalize(user) : null;
  }

  public async readByGithubId(githubId: string): Promise<UserNormalized | null> {
    const user = await this.userModel.findOne({ githubId }).lean<UserEntity>().exec();

    return user ? this.normalize(user) : null;
  }

  /**
   * Only for resolving @mentions, which arrive as a handle with no id attached. Every other
   * route into a user goes by githubId, which GitHub never reuses.
   *
   * Matched on the stored lowercase copy rather than a case-insensitive regex over the original.
   * The regex could not use the index - Mongo cannot serve a case-insensitive pattern from a
   * btree - so every mention in every webhook was a full scan of the collection. An indexed
   * equality also has no pattern to escape, which retires the ReDoS guard that came with it.
   */
  public async readByGithubLogin(githubLogin: string): Promise<UserNormalized | null> {
    const user = await this.userModel
      .findOne({ githubLoginLower: githubLogin.toLowerCase() })
      .lean<UserEntity>()
      .exec();

    return user ? this.normalize(user) : null;
  }

  /**
   * Whether anybody at all has said this account is a person to them, which is to say has it on
   * their allowed bots with bots off - the one mode that list is read under.
   *
   * The router's question about a GitHub App that is about to be silenced, asked before it knows
   * who the event reaches: almost always no, and then the talking is dropped where it always
   * was. A yes only means the poke goes on to be decided person by person - see
   * GithubWebhookRouterService.suppressBotChatter.
   */
  public async isCountedAsPersonByAnybody(login: string): Promise<boolean> {
    const normalized = normalizeAccountLogin(login);

    if (!normalized) {
      return false;
    }

    return this.cache.wrap<boolean>(
      `user:allowed-bots:${normalized}`,
      COUNTED_AS_PERSON_TTL_MS,
      async () =>
        (await this.userModel
          .exists({ 'pokeSettings.botMode': 'none', 'pokeSettings.allowedBots': normalized })
          .exec()) !== null,
    );
  }

  /**
   * Everybody whose inbox is worth keeping ready: asked for it since `usedSince`, and still
   * holding a token.
   *
   * A projection rather than normalised users, deliberately. The inbox warmer asks this every
   * five minutes, and the two things it needs are a date and a settings object - so normalising
   * would put every stored GitHub token through the cipher to answer neither of them.
   *
   * `$exists` and `$ne: null` together rather than either alone: clearGithubAccessToken unsets
   * the field, while a row that never had one has it absent, and both must be excluded.
   */
  public async readInboxWarmTargets(usedSince: Date): Promise<InboxWarmTarget[]> {
    const users = await this.userModel
      .find({
        inboxLastUsedAt: { $gte: usedSince },
        githubAccessToken: { $exists: true, $ne: null },
      })
      .select({ _id: 1, inboxSettings: 1 })
      .lean<Pick<UserEntity, '_id' | 'inboxSettings'>[]>()
      .exec();

    return users.map((user) => ({
      userId: user._id.toString(),
      settings: normalizeInboxSettings(user.inboxSettings),
    }));
  }

  /**
   * Everybody who has turned the digest on and still holds a token. Whose hour has come is the
   * sweep's question, not Mongo's - it cannot evaluate a timezone. Projected for the reason the
   * warmer's targets are: normalising would decrypt every stored token to answer it.
   */
  public async readDigestTargets(): Promise<DigestTarget[]> {
    const users = await this.userModel
      .find({
        'pokeSettings.digestEnabled': true,
        githubAccessToken: { $exists: true, $ne: null },
      })
      .select({ _id: 1, pokeSettings: 1, timezone: 1, digestSentOn: 1, inboxSettings: 1 })
      .lean<
        Pick<UserEntity, '_id' | 'pokeSettings' | 'timezone' | 'digestSentOn' | 'inboxSettings'>[]
      >()
      .exec();

    return users.flatMap((user) => {
      // Without a zone there is no hour to be due at.
      if (!isTimezone(user.timezone)) {
        return [];
      }

      return [
        {
          userId: user._id.toString(),
          timezone: user.timezone,
          hour: normalizePokeSettings(user.pokeSettings).digestHour,
          sentOn: user.digestSentOn,
          settings: normalizeInboxSettings(user.inboxSettings),
        },
      ];
    });
  }

  /**
   * Which of these people are owed a listen reminder: never stopped them, and not had one since
   * `sentBefore`. The claim still decides; this only spares a write for everybody it would refuse.
   *
   * `$not: { $gt }` rather than `$lte`, so a row that has never had one matches too.
   */
  public async readListenReminderDue(userIds: string[], sentBefore: Date): Promise<string[]> {
    const users = await this.userModel
      .find({
        _id: { $in: userIds.filter((id) => Types.ObjectId.isValid(id)) },
        listenReminderStoppedAt: null,
        listenReminderSentAt: { $not: { $gt: sentBefore } },
      })
      .select({ _id: 1 })
      .lean<Pick<UserEntity, '_id'>[]>()
      .exec();

    return users.map((user) => user._id.toString());
  }

  private normalize(user: UserEntity): UserNormalized {
    return UserSerializer.normalize(user, (value) => this.tokenCipher.decrypt(value));
  }
}
