import { PokeMessageEntity } from './poke-message.entity';
import { PokeMessageNormalized } from './poke-message.interface';

export class PokeMessageSerializer {
  public static normalize(entity: PokeMessageEntity): PokeMessageNormalized {
    return {
      id: entity._id.toString(),
      userId: entity.userId,
      userGithubId: entity.userGithubId,
      teamId: entity.teamId,
      channelId: entity.channelId,
      messageTs: entity.messageTs,
      repositoryFullName: entity.repositoryFullName,
      pullRequestNumber: entity.pullRequestNumber,
      notification: entity.notification,
    };
  }
}
