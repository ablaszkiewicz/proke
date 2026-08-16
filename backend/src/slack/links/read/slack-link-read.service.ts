import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SlackLinkEntity } from '../core/entities/slack-link.entity';
import { SlackLinkNormalized } from '../core/entities/slack-link.interface';
import { SlackLinkSerializer } from '../core/entities/slack-link.serializer';

@Injectable()
export class SlackLinkReadService {
  constructor(@InjectModel(SlackLinkEntity.name) private linkModel: Model<SlackLinkEntity>) {}

  /**
   * Where this user's pokes go. The schema allows several workspaces per person and the UI
   * offers one, so the most recently linked wins - connecting somewhere new moves you rather
   * than quietly doubling every poke.
   */
  public async readForUser(userId: string): Promise<SlackLinkNormalized | null> {
    const link = await this.linkModel
      .findOne({ userId })
      .sort({ updatedAt: -1 })
      .lean<SlackLinkEntity>()
      .exec();

    return link ? SlackLinkSerializer.normalize(link) : null;
  }
}
