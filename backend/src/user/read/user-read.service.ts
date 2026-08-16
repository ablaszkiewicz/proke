import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

  private normalize(user: UserEntity): UserNormalized {
    return UserSerializer.normalize(user, (value) => this.tokenCipher.decrypt(value));
  }
}
