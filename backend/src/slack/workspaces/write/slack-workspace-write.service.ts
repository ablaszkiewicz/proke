import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TokenCipherService } from '../../../shared/crypto/token-cipher.service';
import { SlackWorkspaceEntity } from '../core/entities/slack-workspace.entity';

export interface SlackWorkspaceInstallDto {
  teamId: string;
  teamName: string;
  botUserId: string;
  botToken: string;
  botScopes?: string;
  installedByUserId?: string;
}

@Injectable()
export class SlackWorkspaceWriteService {
  constructor(
    @InjectModel(SlackWorkspaceEntity.name)
    private workspaceModel: Model<SlackWorkspaceEntity>,
    private readonly tokenCipher: TokenCipherService,
  ) {}

  /**
   * Upsert, because reinstalling is the normal way to fix a workspace: whoever does it last
   * owns the token. Clearing revokedAt is the point of the exercise - a reinstall after an
   * uninstall has to bring the workspace back to life.
   */
  public async install(dto: SlackWorkspaceInstallDto): Promise<void> {
    await this.workspaceModel.updateOne(
      { teamId: dto.teamId },
      {
        $set: {
          teamName: dto.teamName,
          botUserId: dto.botUserId,
          botToken: this.tokenCipher.encrypt(dto.botToken),
          botScopes: dto.botScopes,
          installedByUserId: dto.installedByUserId,
          revokedAt: null,
        },
      },
      { upsert: true },
    );
  }

  /**
   * Slack has told us the token is dead. Kept rather than deleted: the links pointing at this
   * workspace are still true statements about who someone is, and the dashboard can offer a
   * reinstall instead of pretending the connection never happened.
   */
  public async markRevoked(teamId: string): Promise<void> {
    await this.workspaceModel.updateOne({ teamId }, { $set: { revokedAt: new Date() } }).exec();
  }

  /**
   * Forgets who installed proke into a workspace, without touching the install itself.
   *
   * Used when that person deletes their account. The workspace belongs to everyone still using
   * it - uninstalling it because one member left would take their colleagues' notifications down
   * with them - but the row must stop pointing at a user who no longer exists.
   */
  public async clearInstalledBy(userId: string): Promise<void> {
    await this.workspaceModel
      .updateMany({ installedByUserId: userId }, { $unset: { installedByUserId: '' } })
      .exec();
  }
}
