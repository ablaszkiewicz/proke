import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TokenCipherService } from '../../../shared/crypto/token-cipher.service';
import { SlackWorkspaceEntity } from '../core/entities/slack-workspace.entity';
import {
  SlackWorkspaceNormalized,
  SlackWorkspaceWithToken,
} from '../core/entities/slack-workspace.interface';
import { SlackWorkspaceSerializer } from '../core/entities/slack-workspace.serializer';

@Injectable()
export class SlackWorkspaceReadService {
  constructor(
    @InjectModel(SlackWorkspaceEntity.name)
    private workspaceModel: Model<SlackWorkspaceEntity>,
    private readonly tokenCipher: TokenCipherService,
  ) {}

  public async readByTeamId(teamId: string): Promise<SlackWorkspaceNormalized | null> {
    const workspace = await this.workspaceModel
      .findOne({ teamId })
      .lean<SlackWorkspaceEntity>()
      .exec();

    return workspace ? SlackWorkspaceSerializer.normalize(workspace) : null;
  }

  /**
   * The only way to a usable bot token. Revoked workspaces are excluded here rather than at
   * every call site: a token Slack has already told us is dead is not worth trying.
   */
  public async readLiveWithToken(teamId: string): Promise<SlackWorkspaceWithToken | null> {
    const workspace = await this.workspaceModel
      .findOne({ teamId, revokedAt: null })
      .lean<SlackWorkspaceEntity>()
      .exec();

    if (!workspace) {
      return null;
    }

    return SlackWorkspaceSerializer.normalizeWithToken(workspace, (value) =>
      this.tokenCipher.decrypt(value),
    );
  }
}
