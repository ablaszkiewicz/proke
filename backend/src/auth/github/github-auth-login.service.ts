import { Injectable } from '@nestjs/common';
import { TokenResponse } from '../../shared/responses/token.response';
import { AuthMethod } from '../../user/core/enum/auth-method.enum';
import { UserReadService } from '../../user/read/user-read.service';
import { UserWriteService } from '../../user/write/user-write.service';
import { CustomJwtService } from '../custom-jwt/custom-jwt.service';
import { GithubLoginBody } from './dto/github-login.body';
import { GithubAuthDataService } from './github-auth-data.service';

@Injectable()
export class GithubAuthLoginService {
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
}
