import { InstallationEntity } from './installation.entity';
import { InstallationNormalized } from './installation.interface';

export class InstallationSerializer {
  public static normalize(entity: InstallationEntity): InstallationNormalized {
    return {
      installationId: entity.installationId,
      accountId: entity.accountId,
      accountLogin: entity.accountLogin,
      accountType: entity.accountType,
      repositorySelection: entity.repositorySelection,
      suspendedAt: entity.suspendedAt,
    };
  }

  /**
   * GitHub returns the same installation shape from the REST API and inside webhook payloads,
   * so both paths normalize through here.
   */
  public static fromGithubPayload(payload: any): InstallationNormalized {
    return {
      installationId: String(payload.id),
      accountId: String(payload.account?.id ?? ''),
      accountLogin: payload.account?.login ?? '',
      accountType: payload.account?.type ?? 'User',
      repositorySelection: payload.repository_selection ?? 'all',
      suspendedAt: payload.suspended_at ? new Date(payload.suspended_at) : undefined,
    };
  }
}
