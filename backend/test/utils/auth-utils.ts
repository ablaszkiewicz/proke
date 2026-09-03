import { INestApplication } from '@nestjs/common';
import { AuthSessionService } from '../../src/auth/session/auth-session.service';
import { UserSerialized } from '../../src/user/core/entities/user.interface';
import { UserSerializer } from '../../src/user/core/entities/user.serializer';
import { AuthMethod } from '../../src/user/core/enum/auth-method.enum';
import { UserWriteService } from '../../src/user/write/user-write.service';

export class AuthUtils {
  private readonly userWriteService: UserWriteService;
  private readonly authSessionService: AuthSessionService;

  constructor(private readonly app: INestApplication<any>) {
    this.userWriteService = this.app.get(UserWriteService);
    this.authSessionService = this.app.get(AuthSessionService);
  }

  public async setupUser(dto?: {
    githubId?: string;
    githubLogin?: string;
    email?: string;
    avatarUrl?: string;
    githubAccessToken?: string;
  }): Promise<{
    token: string;
    // A real session, issued the way logging in issues one, so a spec can exercise refreshing
    // and signing out without going through GitHub.
    refreshToken: string;
    user: UserSerialized;
  }> {
    const user = await this.userWriteService.create({
      githubId: dto?.githubId ?? `${Math.floor(Math.random() * 1_000_000)}`,
      githubLogin: dto?.githubLogin,
      email: dto?.email ?? `test-${Math.random()}@example.com`,
      authMethod: AuthMethod.Github,
      avatarUrl: dto?.avatarUrl,
      githubAccessToken: dto?.githubAccessToken,
    });

    const session = await this.authSessionService.issue(user.id);

    return {
      token: session.token,
      refreshToken: session.refreshToken,
      user: UserSerializer.serialize(user),
    };
  }
}
