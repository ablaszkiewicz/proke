import { UserEntity } from './user.entity';
import { UserNormalized, UserSerialized } from './user.interface';

export class UserSerializer {
  /**
   * `decrypt` is required rather than optional so that adding a read path cannot accidentally
   * hand back the ciphertext - the compiler asks for it at every call site. Mirrors
   * SlackWorkspaceSerializer.normalizeWithToken.
   */
  public static normalize(entity: UserEntity, decrypt: (value: string) => string): UserNormalized {
    return {
      id: entity._id.toString(),
      githubId: entity.githubId,
      githubLogin: entity.githubLogin,
      email: entity.email,
      authMethod: entity.authMethod,
      avatarUrl: entity.avatarUrl,
      githubAccessToken: entity.githubAccessToken ? decrypt(entity.githubAccessToken) : undefined,
    };
  }

  /** Deliberately drops githubAccessToken. This is the shape that reaches a client. */
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
