import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InstallationEntity } from '../core/entities/installation.entity';
import { InstallationNormalized } from '../core/entities/installation.interface';

@Injectable()
export class InstallationWriteService {
  constructor(
    @InjectModel(InstallationEntity.name) private installationModel: Model<InstallationEntity>,
  ) {}

  /**
   * Upsert rather than create: GitHub redelivers webhooks, and a reinstall reuses nothing but
   * does resend `created`. Keyed on installationId so replays are harmless.
   */
  public async upsert(installation: InstallationNormalized): Promise<void> {
    await this.installationModel.updateOne(
      { installationId: installation.installationId },
      {
        $set: {
          accountId: installation.accountId,
          accountLogin: installation.accountLogin,
          accountType: installation.accountType,
          repositorySelection: installation.repositorySelection,
          // Explicitly written, including when it clears on unsuspend.
          suspendedAt: installation.suspendedAt ?? null,
        },
      },
      { upsert: true },
    );
  }

  public async delete(installationId: string): Promise<void> {
    await this.installationModel.deleteOne({ installationId });
  }
}
