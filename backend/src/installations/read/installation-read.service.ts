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

  public async readByAccountLogins(logins: string[]): Promise<InstallationNormalized[]> {
    if (logins.length === 0) {
      return [];
    }

    const installations = await this.installationModel
      .find({ accountLogin: { $in: logins } })
      .lean<InstallationEntity[]>()
      .exec();

    return installations.map((installation) => InstallationSerializer.normalize(installation));
  }
}
