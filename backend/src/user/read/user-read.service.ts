import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserEntity } from '../core/entities/user.entity';
import { UserNormalized } from '../core/entities/user.interface';
import { UserSerializer } from '../core/entities/user.serializer';

@Injectable()
export class UserReadService {
  constructor(@InjectModel(UserEntity.name) private userModel: Model<UserEntity>) {}

  public async readByIdOrThrow(id: string): Promise<UserNormalized> {
    const user = await this.userModel.findById(id).lean<UserEntity>().exec();

    if (!user) {
      throw new NotFoundException(`User not found`);
    }

    return UserSerializer.normalize(user);
  }

  public async readByGithubId(githubId: string): Promise<UserNormalized | null> {
    const user = await this.userModel.findOne({ githubId }).lean<UserEntity>().exec();

    return user ? UserSerializer.normalize(user) : null;
  }

  /**
   * Only for resolving @mentions, which arrive as a handle with no id attached. Matched
   * case-insensitively because GitHub renders `@Ada` and `@ada` as the same person.
   */
  public async readByGithubLogin(githubLogin: string): Promise<UserNormalized | null> {
    const user = await this.userModel
      .findOne({ githubLogin: new RegExp(`^${escapeRegExp(githubLogin)}$`, 'i') })
      .lean<UserEntity>()
      .exec();

    return user ? UserSerializer.normalize(user) : null;
  }

  public async readByEmail(email: string): Promise<UserNormalized | null> {
    const user = await this.userModel.findOne({ email }).lean<UserEntity>().exec();

    return user ? UserSerializer.normalize(user) : null;
  }
}

// The handle comes out of webhook text somebody else wrote. It cannot reach a query as a live
// pattern - `@a{10000}` would be a regex denial of service against every mention we process.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
