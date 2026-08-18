import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PokeMessageEntity } from '../core/entities/poke-message.entity';
import { PokeMessageNormalized } from '../core/entities/poke-message.interface';
import { PokeMessageSerializer } from '../core/entities/poke-message.serializer';

@Injectable()
export class PokeMessageReadService {
  constructor(
    @InjectModel(PokeMessageEntity.name) private messageModel: Model<PokeMessageEntity>,
  ) {}

  /**
   * Every review request still outstanding on one pull request.
   *
   * All of them rather than one, because a review nobody was waiting on is the uninteresting
   * case: the point of asking is that four people were poked and one of them has now made the
   * other three unnecessary.
   */
  public async readForPullRequest(
    repositoryFullName: string,
    pullRequestNumber: number,
  ): Promise<PokeMessageNormalized[]> {
    const messages = await this.messageModel
      .find({ repositoryFullName, pullRequestNumber })
      .lean<PokeMessageEntity[]>()
      .exec();

    return messages.map((message) => PokeMessageSerializer.normalize(message));
  }
}
