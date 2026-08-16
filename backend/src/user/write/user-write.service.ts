import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, UpdateQuery } from 'mongoose';
import { TokenCipherService } from '../../shared/crypto/token-cipher.service';
import { UserEntity } from '../core/entities/user.entity';
import { UserNormalized } from '../core/entities/user.interface';
import { UserSerializer } from '../core/entities/user.serializer';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * How stale `lastActivityDate` is allowed to get. Writing it on every authenticated request
 * would be a database write per request to store something nobody reads to the minute.
 */
const ACTIVITY_RESOLUTION_MS = 60 * 60 * 1000;

@Injectable()
export class UserWriteService {
  constructor(
    @InjectModel(UserEntity.name) private userModel: Model<UserEntity>,
    private readonly tokenCipher: TokenCipherService,
  ) {}

  public async create(dto: CreateUserDto): Promise<UserNormalized> {
    if (dto.githubLogin) {
      await this.releaseGithubLogin(dto.githubLogin);
    }

    const user = await this.userModel.create({
      githubId: dto.githubId,
      githubLogin: dto.githubLogin,
      githubLoginLower: dto.githubLogin?.toLowerCase(),
      email: dto.email,
      authMethod: dto.authMethod,
      avatarUrl: dto.avatarUrl,
      githubAccessToken: this.encryptToken(dto.githubAccessToken),
      lastActivityDate: new Date(),
    });

    return this.normalize(user);
  }

  public async update(dto: UpdateUserDto): Promise<UserNormalized> {
    const updateQuery: UpdateQuery<UserEntity> = {};

    if (dto.githubId) {
      updateQuery.githubId = dto.githubId;
    }

    if (dto.githubLogin) {
      // Whoever is being updated has just proved they own this handle, so any other row still
      // holding it is a leftover from a rename. Released before the claim, or the unique index
      // on githubLoginLower would reject the write.
      await this.releaseGithubLogin(dto.githubLogin, dto.id);

      updateQuery.githubLogin = dto.githubLogin;
      updateQuery.githubLoginLower = dto.githubLogin.toLowerCase();
    }

    if (dto.email) {
      updateQuery.email = dto.email;
    }

    if (dto.authMethod) {
      updateQuery.authMethod = dto.authMethod;
    }

    if (dto.avatarUrl) {
      updateQuery.avatarUrl = dto.avatarUrl;
    }

    if (dto.githubAccessToken) {
      updateQuery.githubAccessToken = this.encryptToken(dto.githubAccessToken);
    }

    const user = await this.userModel.findOneAndUpdate(
      { _id: new Types.ObjectId(dto.id) },
      updateQuery,
      { new: true },
    );

    if (!user) {
      throw new Error(`User with id ${dto.id} not found for update`);
    }

    return this.normalize(user);
  }

  /**
   * Used when GitHub rejects a stored token. update() cannot express this - it skips falsy
   * values by design - and without it a token GitHub has already refused is presented again on
   * every connections page load, forever.
   */
  public async clearGithubAccessToken(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $unset: { githubAccessToken: '' } },
    );
  }

  /**
   * Marks the user as having been seen, at most once an hour.
   *
   * The `$lt` in the filter is what makes that a single unconditional write rather than a read
   * followed by a write: a request inside the window matches nothing and costs one indexed
   * lookup. Called from the auth guard, so it runs on every authenticated request.
   */
  public async recordActivity(userId: string, now: Date = new Date()): Promise<void> {
    await this.userModel.updateOne(
      {
        _id: new Types.ObjectId(userId),
        lastActivityDate: { $lt: new Date(now.getTime() - ACTIVITY_RESOLUTION_MS) },
      },
      { $set: { lastActivityDate: now } },
    );
  }

  public async delete(userId: string): Promise<void> {
    await this.userModel.deleteOne({ _id: new Types.ObjectId(userId) });
  }

  /**
   * Takes a handle off every row except the one about to claim it.
   *
   * GitHub frees a handle the moment its owner renames, so the previous holder's row can still
   * be carrying it. Only the display copy and its lowercase index key are cleared - the row is
   * a real user, identified by githubId, and stays exactly where it is. They lose nothing but
   * the ability to receive @mentions under a name that is no longer theirs, which is the point.
   */
  private async releaseGithubLogin(githubLogin: string, exceptUserId?: string): Promise<void> {
    const filter: Record<string, unknown> = { githubLoginLower: githubLogin.toLowerCase() };

    if (exceptUserId) {
      filter._id = { $ne: new Types.ObjectId(exceptUserId) };
    }

    await this.userModel.updateMany(filter, {
      $unset: { githubLogin: '', githubLoginLower: '' },
    });
  }

  private encryptToken(token: string | undefined): string | undefined {
    return token ? this.tokenCipher.encrypt(token) : undefined;
  }

  private normalize(user: UserEntity): UserNormalized {
    return UserSerializer.normalize(user, (value) => this.tokenCipher.decrypt(value));
  }
}
