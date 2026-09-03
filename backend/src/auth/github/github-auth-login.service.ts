import { Injectable } from '@nestjs/common';
import { AnalyticsService } from '../../analytics/analytics.service';
import { TokenResponse } from '../../shared/responses/token.response';
import { AuthMethod } from '../../user/core/enum/auth-method.enum';
import { UserReadService } from '../../user/read/user-read.service';
import { UserWriteService } from '../../user/write/user-write.service';
import { AuthSessionService } from '../session/auth-session.service';
import { GithubLoginBody } from './dto/github-login.body';
import { GithubAuthDataService, GithubProfile } from './github-auth-data.service';

@Injectable()
export class GithubAuthLoginService {
  constructor(
    private readonly authSessionService: AuthSessionService,
    private readonly userReadService: UserReadService,
    private readonly userWriteService: UserWriteService,
    private readonly githubAuthDataService: GithubAuthDataService,
    private readonly analytics: AnalyticsService,
  ) {}

  public async login(dto: GithubLoginBody): Promise<TokenResponse> {
    const accessToken = await this.githubAuthDataService.getAccessToken(dto.githubCode);

    const profile = await this.githubAuthDataService.getGithubProfile(accessToken);

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

      this.recordLogin(user.id, profile, email, false);

      return this.authSessionService.issue(user.id);
    }

    const createdUser = await this.userWriteService.create({
      githubId: profile.id,
      githubLogin: profile.login,
      email,
      authMethod: AuthMethod.Github,
      avatarUrl: profile.avatarUrl,
      githubAccessToken: accessToken,
    });

    this.recordLogin(createdUser.id, profile, email, true);

    // A fresh session every time somebody logs in, including a re-login on a device that already
    // had one. Sessions are per login rather than per user - see RefreshTokenEntity - so this
    // adds one rather than replacing what the other devices are holding.
    return this.authSessionService.issue(createdUser.id);
  }

  /**
   * The event, and the person it belongs to, in one place for both branches above.
   *
   * This is where the two halves of proke's analytics meet. The distinct id is `user.id` - the
   * same value the browser will pass to posthog.identify() a moment later, once it has fetched
   * /users/me - so this event and every frontend one land on one person. It fires *before* the
   * browser knows that id, which is fine: identify folds the anonymous landing-page person into
   * this one rather than starting a second.
   *
   * signed_up_at is written on the create branch only. $set_once would otherwise stamp today's
   * date onto everyone who signed up before any of this existed.
   */
  private recordLogin(
    userId: string,
    profile: GithubProfile,
    email: string | undefined,
    isNewUser: boolean,
  ): void {
    this.analytics.identify(
      userId,
      {
        github_id: profile.id,
        github_login: profile.login,
        email,
        avatar_url: profile.avatarUrl,
      },
      isNewUser ? { signed_up_at: new Date().toISOString() } : {},
    );

    this.analytics.capture(userId, 'github_login_succeeded', {
      is_new_user: isNewUser,
      github_login: profile.login,
    });
  }
}
