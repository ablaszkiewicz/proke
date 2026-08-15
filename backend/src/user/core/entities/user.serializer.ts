import { UserEntity } from './user.entity';
import { UserNormalized, UserSerialized } from './user.interface';

export class UserSerializer {
  public static normalize(entity: UserEntity): UserNormalized {
    return {
      id: entity._id.toString(),
      githubId: entity.githubId,
      githubLogin: entity.githubLogin,
      email: entity.email,
      authMethod: entity.authMethod,
      avatarUrl: entity.avatarUrl,
      githubAccessToken: entity.githubAccessToken,
    };
  }

  public static serialize(normalized: UserNormalized): UserSerialized {
    return {
      id: normalized.id,
      githubId: normalized.githubId,
      githubLogin: normalized.githubLogin,
      email: normalized.email,
      authMethod: normalized.authMethod,
      avatarUrl: normalized.avatarUrl,
    };
  }
}
