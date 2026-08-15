import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { getEnvConfig } from '../../shared/configs/env-configs';

export interface GithubProfile {
  // GitHub's numeric user id, stringified. Immutable and never reused - this is the identity.
  id: string;
  // The @handle. Free to change, so it is display data only.
  login: string;
  avatarUrl?: string;
}

@Injectable()
export class GithubAuthDataService {
  private readonly logger = new Logger(GithubAuthDataService.name);

  public async getAccessToken(code: string): Promise<string> {
    const { clientId, clientSecret } = getEnvConfig().githubApp;

    // Checked here rather than left to GitHub, which reports missing credentials as
    // "Not Found" or "client_id and/or client_secret passed are incorrect" - both of which
    // read like the values are wrong rather than absent.
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'GitHub App credentials are not configured. Set GITHUB_APP_CLIENT_ID and ' +
          'GITHUB_APP_CLIENT_SECRET in backend/.env, then restart the backend.',
      );
    }

    const response = await fetch(`https://github.com/login/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Without this GitHub answers in form-encoded, including for errors, which is far
        // easier to misparse as a valid token.
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const data = await this.parseTokenResponse(response);

    // GitHub reports OAuth failures with a 200 and an error body, so the status is no help.
    if (data.error || !data.access_token) {
      throw new BadRequestException(
        `GitHub rejected the login: ${data.error_description ?? data.error ?? 'no access token returned'}`,
      );
    }

    return data.access_token;
  }

  public async getGithubProfile(accessToken: string): Promise<GithubProfile> {
    const response = await fetch(`https://api.github.com/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new BadRequestException(`Could not read the GitHub profile (${response.status})`);
    }

    const user = await response.json();

    if (!user?.id) {
      throw new BadRequestException('GitHub profile response had no user id');
    }

    return {
      id: String(user.id),
      login: user.login,
      avatarUrl: user.avatar_url,
    };
  }

  public async getGithubEmail(accessToken: string): Promise<string | undefined> {
    const response = await fetch(`https://api.github.com/user/emails`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Email is a display attribute, not the identity - that is githubId. So an unreadable
    // address degrades to "no email" instead of blocking the login. A 403 here usually means
    // the app is missing the "Email addresses" account permission; GitHub Apps ignore the
    // user:email scope entirely.
    if (!response.ok) {
      this.logger.warn(
        `Could not read GitHub emails (${response.status}). Grant the app's ` +
          'Account permission "Email addresses: Read" to populate it.',
      );
      return undefined;
    }

    const emails = await response.json();

    if (!Array.isArray(emails)) {
      this.logger.warn('Unexpected GitHub emails response');
      return undefined;
    }

    return emails.find((email) => email.primary && email.verified)?.email;
  }

  private async parseTokenResponse(
    response: Response,
  ): Promise<{ access_token?: string; error?: string; error_description?: string }> {
    const body = await response.text();

    try {
      return JSON.parse(body);
    } catch {
      // Older/unexpected responses come back form-encoded.
      return Object.fromEntries(new URLSearchParams(body));
    }
  }
}
