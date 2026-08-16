import { SlackWorkspaceEntity } from './slack-workspace.entity';
import { SlackWorkspaceNormalized, SlackWorkspaceWithToken } from './slack-workspace.interface';

export class SlackWorkspaceSerializer {
  /** Deliberately drops botToken. Getting at it takes the call below, and a decrypt function. */
  public static normalize(entity: SlackWorkspaceEntity): SlackWorkspaceNormalized {
    return {
      id: entity._id.toString(),
      teamId: entity.teamId,
      teamName: entity.teamName,
      botUserId: entity.botUserId,
      botScopes: entity.botScopes,
      installedByUserId: entity.installedByUserId,
      revokedAt: entity.revokedAt,
    };
  }

  public static normalizeWithToken(
    entity: SlackWorkspaceEntity,
    decrypt: (value: string) => string,
  ): SlackWorkspaceWithToken {
    return {
      ...this.normalize(entity),
      botToken: decrypt(entity.botToken ?? ''),
    };
  }
}
