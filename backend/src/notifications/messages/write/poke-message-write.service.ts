import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GithubNotificationNormalized } from '../../core/entities/github-notification.interface';
import { PokeMessageEntity } from '../core/entities/poke-message.entity';
import { PokeMessageReviewer } from '../core/entities/poke-message.interface';

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
   *
   * Whoever had reviewed by then goes with the old message. The new one was rendered without
   * them, and the row has to say what the message says.
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
        $unset: { reviewers: '' },
      },
      { upsert: true },
    );
  }

  /**
   * Notes that somebody has reviewed the pull request without deciding about it.
   *
   * An add-to-set, so the same review delivered twice - or the same person reviewing twice -
   * names them once. Deliberately without touching the timestamps: the TTL is how long the
   * request is worth editing, and a comment on the pull request does not make the request to
   * review it any younger.
   */
  public async addReviewer(id: string, reviewer: PokeMessageReviewer): Promise<void> {
    await this.messageModel
      .updateOne(
        { _id: id },
        { $addToSet: { reviewers: compact(reviewer) } },
        { timestamps: false },
      )
      .exec();
  }

  /** Settled, or unsettleable. Either way there is nothing left to go back and edit. */
  public async delete(id: string): Promise<void> {
    await this.messageModel.deleteOne({ _id: id }).exec();
  }

  public async deleteForUser(userId: string): Promise<void> {
    await this.messageModel.deleteMany({ userId }).exec();
  }
}

/**
 * Without the keys that hold nothing. $addToSet compares whole documents, so `{ login }` and
 * `{ githubId: undefined, login }` would be two different people to it - and which of the two
 * gets written depends on what the driver makes of an undefined.
 */
function compact(reviewer: PokeMessageReviewer): PokeMessageReviewer {
  return {
    ...(reviewer.githubId ? { githubId: reviewer.githubId } : {}),
    ...(reviewer.login ? { login: reviewer.login } : {}),
  };
}
