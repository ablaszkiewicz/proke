import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { TokenResponse } from '../../shared/responses/token.response';
import { AuthMethod } from '../../user/core/enum/auth-method.enum';
import { UserReadService } from '../../user/read/user-read.service';
import { UserWriteService } from '../../user/write/user-write.service';
import { CustomJwtService } from '../custom-jwt/custom-jwt.service';
import { GithubLoginBody } from './dto/github-login.body';
import { GithubAuthDataService } from './github-auth-data.service';

/**
 * Temporary: proke is closed while it is being built, so exactly one account gets past the
 * OAuth round trip. Hard-coded rather than read from the environment on purpose - it is meant
 * to be deleted when the app opens up, not to become a setting nobody remembers to unset.
 *
 * Handles rather than email addresses, because /user/emails needs the "Email addresses: Read"
 * account permission and quietly returns nothing without it - which a gate reads as "not on the
 * list" and locks everyone out. The handle comes back from /user, which the login already needs.
 *
 * Lowercase entries, no leading @; the incoming handle is normalized before it is compared.
 */
export const ALLOWED_GITHUB_LOGINS = ['ablaszkiewicz'];

@Injectable()
export class GithubAuthLoginService {
  private readonly logger = new Logger(GithubAuthLoginService.name);

  constructor(
    private readonly jwtService: CustomJwtService,
    private readonly userReadService: UserReadService,
    private readonly userWriteService: UserWriteService,
    private readonly githubAuthDataService: GithubAuthDataService,
  ) {}

  public async login(dto: GithubLoginBody): Promise<TokenResponse> {
    const accessToken = await this.githubAuthDataService.getAccessToken(dto.githubCode);

    const profile = await this.githubAuthDataService.getGithubProfile(accessToken);

    // As early as the handle is known: before the extra call for the email, and before any read
    // or write. A rejected login must not leave an account behind, and must not refresh the
    // stored token on one that already exists.
    this.assertLoginAllowed(profile.login);

    const email = await this.githubAuthDataService.getGithubEmail(accessToken);

    const user = await this.userReadService.readByGithubId(profile.id);

    if (user) {
      // The handle, email and avatar can all have changed on GitHub's side since the last
      // login. The id cannot, which is why it is what we matched on.
      await this.userWriteService.update({
        id: user.id,
        githubLogin: profile.login,
        email,
        avatarUrl: profile.avatarUrl,
        // Always overwrite: a re-authorization is how a user grants new scopes, and the old
        // token would keep the old, narrower ones.
        githubAccessToken: accessToken,
      });

      return {
        token: await this.jwtService.sign({ id: user.id }),
      };
    }

    const createdUser = await this.userWriteService.create({
      githubId: profile.id,
      githubLogin: profile.login,
      email,
      authMethod: AuthMethod.Github,
      avatarUrl: profile.avatarUrl,
      githubAccessToken: accessToken,
    });

    return {
      token: await this.jwtService.sign({ id: createdUser.id }),
    };
  }

  /**
   * Handles are case-insensitive on GitHub's side, and a list edited by hand is as likely to
   * carry the @ as not, so both are normalized away rather than left to trip someone up.
   */
  private assertLoginAllowed(githubLogin: string): void {
    const normalized = githubLogin.trim().toLowerCase().replace(/^@/, '');

    if (ALLOWED_GITHUB_LOGINS.includes(normalized)) {
      return;
    }

    this.logger.warn(`Rejected login for @${normalized}: not on the allowlist.`);

    throw new ForbiddenException('proke is closed right now, and this account is not on the list.');
  }
}
