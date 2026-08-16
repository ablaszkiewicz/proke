import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InstallationEntity } from '../core/entities/installation.entity';
import { InstallationNormalized } from '../core/entities/installation.interface';
import { InstallationSerializer } from '../core/entities/installation.serializer';

@Injectable()
export class InstallationReadService {
  constructor(
    @InjectModel(InstallationEntity.name) private installationModel: Model<InstallationEntity>,
  ) {}

  /**
   * The mirror's rows for a set of installations, keyed by installation id so a caller that
   * already has the ids can enrich them in one query.
   *
   * GitHub is the only thing that can say *which* installations a given user may see, so the id
   * list still comes from there. What the mirror answers is what proke knows about each of them,
   * which is the same answer for every user looking at the same org.
   */
  public async readByInstallationIds(
    installationIds: string[],
  ): Promise<Map<string, InstallationNormalized>> {
    if (installationIds.length === 0) {
      return new Map();
    }

    const installations = await this.installationModel
      .find({ installationId: { $in: installationIds } })
      .lean<InstallationEntity[]>()
      .exec();

    return new Map(
      installations.map((installation) => [
        installation.installationId,
        InstallationSerializer.normalize(installation),
      ]),
    );
  }
}
