import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GithubNotificationNormalized } from '../../core/entities/github-notification.interface';
import { PokeMessageEntity } from '../core/entities/poke-message.entity';

export interface PokeMessageRememberDto {
  userId: string;
  userGithubId?: string;
  teamId: string;
  channelId: string;
  messageTs: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  notification: GithubNotificationNormalized;
}

@Injectable()
export class PokeMessageWriteService {
  constructor(
    @InjectModel(PokeMessageEntity.name) private messageModel: Model<PokeMessageEntity>,
  ) {}

  /**
   * Where a review request landed in Slack.
   *
   * An upsert, so a review requested a second time points at the second message. The first one
   * is then unreachable and will never be struck through - which is correct, because it is a
   * message about a request that has since been made again, and the live one is the new one.
   */
  public async remember(dto: PokeMessageRememberDto): Promise<void> {
    await this.messageModel.updateOne(
      {
        userId: dto.userId,
        repositoryFullName: dto.repositoryFullName,
        pullRequestNumber: dto.pullRequestNumber,
      },
      {
        $set: {
          userGithubId: dto.userGithubId,
          teamId: dto.teamId,
          channelId: dto.channelId,
          messageTs: dto.messageTs,
          notification: dto.notification,
        },
      },
      { upsert: true },
    );
  }

  /** Settled, or unsettleable. Either way there is nothing left to go back and edit. */
  public async delete(id: string): Promise<void> {
    await this.messageModel.deleteOne({ _id: id }).exec();
  }

  public async deleteForUser(userId: string): Promise<void> {
    await this.messageModel.deleteMany({ userId }).exec();
  }
}
