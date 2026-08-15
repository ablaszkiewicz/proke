import { AuthMethod } from '../../core/enum/auth-method.enum';

export class UpdateUserDto {
  id: string;
  githubId?: string;
  githubLogin?: string;
  email?: string;
  authMethod?: AuthMethod;
  avatarUrl?: string;
  githubAccessToken?: string;
}
