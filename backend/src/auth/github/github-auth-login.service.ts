import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { TokenResponse } from '../../shared/responses/token.response';
import { AuthMethod } from '../../user/core/enum/auth-method.enum';
import { UserReadService } from '../../user/read/user-read.service';
import { UserWriteService } from '../../user/write/user-write.service';
import { CustomJwtService } from '../custom-jwt/custom-jwt.service';
import { GithubLoginBody } from './dto/github-login.body';
import { GithubAuthDataService } from './github-auth-data.service';

/**
 * Temporary: proke is closed while it is being built, so exactly one address gets past the
 * OAuth round trip. Hard-coded rather than read from the environment on purpose - it is meant
 * to be deleted when the app opens up, not to become a setting nobody remembers to unset.
 *
 * Lowercase entries only; the incoming address is normalized before it is compared.
 */
export const ALLOWED_LOGIN_EMAILS = ['kqmdjc8@gmail.com'];

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
    const email = await this.githubAuthDataService.getGithubEmail(accessToken);

    // Before any read or write. A rejected login must not leave an account behind, and must not
    // refresh the stored token on one that already exists.
    this.assertEmailAllowed(email, profile.login);

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
   * Fails closed on a missing address. Everywhere else an unreadable email costs nothing but a
   * display attribute, but here it is the thing being checked, and "we could not read it" is
   * not "it is on the list". If this starts rejecting the allowed account, the GitHub App has
   * lost its Account permission "Email addresses: Read".
   */
  private assertEmailAllowed(email: string | undefined, githubLogin: string): void {
    const normalized = email?.trim().toLowerCase();

    if (normalized && ALLOWED_LOGIN_EMAILS.includes(normalized)) {
      return;
    }

    this.logger.warn(
      `Rejected login for @${githubLogin} (${normalized ?? 'no readable email'}): not on the allowlist.`,
    );

    throw new ForbiddenException('proke is closed right now, and this account is not on the list.');
  }
}
