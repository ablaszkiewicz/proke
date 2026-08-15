import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, UpdateQuery } from 'mongoose';
import { UserEntity } from '../core/entities/user.entity';
import { UserNormalized } from '../core/entities/user.interface';
import { UserSerializer } from '../core/entities/user.serializer';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserWriteService {
  constructor(@InjectModel(UserEntity.name) private userModel: Model<UserEntity>) {}

  public async create(dto: CreateUserDto): Promise<UserNormalized> {
    const user = await this.userModel.create({
      githubId: dto.githubId,
      githubLogin: dto.githubLogin,
      email: dto.email,
      authMethod: dto.authMethod,
      avatarUrl: dto.avatarUrl,
      githubAccessToken: dto.githubAccessToken,
      lastActivityDate: new Date(),
    });

    return UserSerializer.normalize(user);
  }

  public async update(dto: UpdateUserDto): Promise<UserNormalized> {
    const updateQuery: UpdateQuery<UserEntity> = {};

    if (dto.githubId) {
      updateQuery.githubId = dto.githubId;
    }

    if (dto.githubLogin) {
      updateQuery.githubLogin = dto.githubLogin;
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
      updateQuery.githubAccessToken = dto.githubAccessToken;
    }

    const user = await this.userModel.findOneAndUpdate(
      { _id: new Types.ObjectId(dto.id) },
      updateQuery,
      { new: true },
    );

    if (!user) {
      throw new Error(`User with id ${dto.id} not found for update`);
    }

    return UserSerializer.normalize(user);
  }

  // Used when GitHub rejects a stored token. update() cannot express this - it skips falsy
  // values by design - and without it a revoked token gets retried every poll, forever.
  public async clearGithubAccessToken(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $unset: { githubAccessToken: '' } },
    );
  }

  public async updateLastActivityDate(userId: string, date: Date): Promise<void> {
    await this.userModel.updateOne({ _id: new Types.ObjectId(userId) }, { lastActivityDate: date });
  }

  public async delete(userId: string): Promise<void> {
    await this.userModel.deleteOne({ _id: new Types.ObjectId(userId) });
  }
}
