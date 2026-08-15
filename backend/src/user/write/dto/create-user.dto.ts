import { AuthMethod } from '../../core/enum/auth-method.enum';

export class CreateUserDto {
  githubId?: string;
  githubLogin?: string;
  email?: string;
  authMethod: AuthMethod;
  avatarUrl?: string;
  githubAccessToken?: string;
}
