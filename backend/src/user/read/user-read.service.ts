import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TokenCipherService } from '../../shared/crypto/token-cipher.service';
import { UserEntity } from '../core/entities/user.entity';
import { UserNormalized } from '../core/entities/user.interface';
import { UserSerializer } from '../core/entities/user.serializer';

@Injectable()
export class UserReadService {
  constructor(
    @InjectModel(UserEntity.name) private userModel: Model<UserEntity>,
    private readonly tokenCipher: TokenCipherService,
  ) {}

  public async readByIdOrThrow(id: string): Promise<UserNormalized> {
    const user = await this.userModel.findById(id).lean<UserEntity>().exec();

    if (!user) {
      throw new NotFoundException(`User not found`);
    }

    return this.normalize(user);
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
   * Of the given users, the ones there is any point asking GitHub about: seen since `activeSince`
   * and still holding a token.
   *
   * Ids in and ids out, deliberately. The inbox warmer asks this about everybody holding a pin
   * every five minutes, and the two things it needs to know are a date and whether a field is
   * present - so normalizing would put every stored GitHub token through the cipher to answer
   * neither of them.
   *
   * `$exists` and `$ne: null` together rather than either alone: clearGithubAccessToken unsets
   * the field, while a row that never had one has it absent, and both must be excluded.
   */
  public async readRefreshableIds(ids: string[], activeSince: Date): Promise<string[]> {
    const users = await this.userModel
      .find({
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        lastActivityDate: { $gte: activeSince },
        githubAccessToken: { $exists: true, $ne: null },
      })
      .select({ _id: 1 })
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();

    return users.map((user) => user._id.toString());
  }

  private normalize(user: UserEntity): UserNormalized {
    return UserSerializer.normalize(user, (value) => this.tokenCipher.decrypt(value));
  }
}
