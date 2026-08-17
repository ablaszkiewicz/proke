import { Injectable, Logger } from '@nestjs/common';

// One page, deliberately. `total_count` is authoritative for the number whatever we ask for, so
// a second request would only ever buy more names for a list nobody reads past the first dozen of.
const PER_PAGE = 100;

export interface AccessibleRepository {
  // GitHub's numeric repository id, as a string - the same key the notification preferences use,
  // so a repository picker can be built straight off this list.
  repositoryId: string;
  fullName: string;
  private: boolean;
}

export interface AccessibleRepositories {
  /** Every repository this user reaches through the installation, not just the named ones. */
  totalCount: number;
  /** The first page of them, in GitHub's order. */
  repositories: AccessibleRepository[];
}

/**
 * Which repositories *the authenticated user* can reach through one installation.
 *
 * A different question from `repository_selection` on the installation itself, which describes
 * what the installer granted the app and reads the same to everybody who can see it. A
 * colleague who installed proke across their whole personal account and then shared one
 * repository with you reports "all"; an org-wide install reports "all" to a contractor who is
 * in three of its two hundred repositories. Only this endpoint, asked with the user's own
 * token, answers what that person actually sees.
 */
@Injectable()
export class GithubUserRepositoriesDataService {
  private readonly logger = new Logger(GithubUserRepositoriesDataService.name);

  public async listForInstallation(
    accessToken: string,
    installationId: string,
  ): Promise<AccessibleRepositories | null> {
    const response = await fetch(
      `https://api.github.com/user/installations/${encodeURIComponent(installationId)}` +
        `/repositories?per_page=${PER_PAGE}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    // Null rather than an empty list, all the way down: "we could not ask" and "you can reach
    // nothing here" render as completely different sentences, and the second one is alarming.
    if (!response.ok) {
      this.logger.warn(
        `GET /user/installations/${installationId}/repositories responded ${response.status}`,
      );
      return null;
    }

    const body = await response.json();

    if (!Array.isArray(body?.repositories)) {
      return null;
    }

    const repositories = body.repositories.map((repository: any): AccessibleRepository => ({
      repositoryId: String(repository.id),
      fullName: repository.full_name ?? repository.name ?? '',
      private: Boolean(repository.private),
    }));

    const totalCount = Number(body.total_count);

    return {
      // A malformed total_count would render as "NaN repos". What came back is the floor.
      totalCount: Number.isFinite(totalCount)
        ? Math.max(totalCount, repositories.length)
        : repositories.length,
      repositories,
    };
  }
}
