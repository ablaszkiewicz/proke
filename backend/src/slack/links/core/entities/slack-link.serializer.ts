import { SlackLinkEntity } from './slack-link.entity';
import { SlackLinkNormalized } from './slack-link.interface';

export class SlackLinkSerializer {
  public static normalize(entity: SlackLinkEntity): SlackLinkNormalized {
    return {
      id: entity._id.toString(),
      userId: entity.userId,
      teamId: entity.teamId,
      teamName: entity.teamName,
      slackUserId: entity.slackUserId,
      slackHandle: entity.slackHandle,
      dmChannelId: entity.dmChannelId,
    };
  }
}
