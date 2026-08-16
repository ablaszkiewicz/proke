import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SlackLinkEntity } from '../core/entities/slack-link.entity';

export interface SlackLinkUpsertDto {
  userId: string;
  teamId: string;
  teamName?: string;
  slackUserId: string;
  slackHandle?: string;
}

@Injectable()
export class SlackLinkWriteService {
  constructor(@InjectModel(SlackLinkEntity.name) private linkModel: Model<SlackLinkEntity>) {}

  /**
   * Links this user to a workspace, and drops any link to a different one.
   *
   * The replace is a product decision rather than a storage one: the dashboard offers a single
   * Slack destination, so authorizing in a second workspace should move the pokes, not send
   * two of everything. The unique pair index stays as it is, ready for the day the UI can show
   * more than one.
   */
  public async upsert(dto: SlackLinkUpsertDto): Promise<void> {
    await this.linkModel.updateOne(
      { userId: dto.userId, teamId: dto.teamId },
      {
        // dmChannelId is deliberately left alone: re-authorizing in the same workspace is the
        // common case and the cached channel is still good.
        $set: {
          teamName: dto.teamName,
          slackUserId: dto.slackUserId,
          slackHandle: dto.slackHandle,
        },
      },
      { upsert: true },
    );

    await this.linkModel.deleteMany({ userId: dto.userId, teamId: { $ne: dto.teamId } });
  }

  public async cacheDmChannel(userId: string, teamId: string, dmChannelId: string): Promise<void> {
    await this.linkModel.updateOne({ userId, teamId }, { $set: { dmChannelId } }).exec();
  }

  /** The cached channel is gone or wrong. Cheaper to reopen next time than to guess why. */
  public async clearDmChannel(userId: string, teamId: string): Promise<void> {
    await this.linkModel.updateOne({ userId, teamId }, { $unset: { dmChannelId: 1 } }).exec();
  }

  public async deleteForUser(userId: string): Promise<void> {
    await this.linkModel.deleteMany({ userId }).exec();
  }

  /** Slack says this person is not in that workspace any more. Only that pairing is untrue. */
  public async delete(userId: string, teamId: string): Promise<void> {
    await this.linkModel.deleteOne({ userId, teamId }).exec();
  }

  /**
   * Used when a workspace goes away. The identities were only ever true relative to it, so
   * they go with it - unlike the workspace row itself, which survives to explain the gap.
   */
  public async deleteForTeam(teamId: string): Promise<void> {
    await this.linkModel.deleteMany({ teamId }).exec();
  }
}
