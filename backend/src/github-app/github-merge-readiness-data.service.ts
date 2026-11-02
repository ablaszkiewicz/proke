import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../analytics/metrics.service';
import { MergeReadiness } from '../notifications/core/entities/github-notification.interface';
import { githubFetch } from '../shared/http/github-fetch';
import { GithubAppTokenService } from './github-app-token.service';

/**
 * GitHub works out whether a pull request conflicts in the background, after the event that
 * changed it. Right after an approval the answer is usually there already; when it is not, one
 * short wait is enough far more often than not.
 */
const UNKNOWN_RETRY_MS = 2_000;

const QUERY = `
query ($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      state
      isDraft
      reviewDecision
      mergeable
      reviewRequests(first: 1) { totalCount }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    }
  }
}`;

interface PullRequestState {
  state?: string;
  isDraft?: boolean;
  reviewDecision?: string | null;
  mergeable?: string;
  reviewRequests?: { totalCount?: number };
  commits?: { nodes?: { commit?: { statusCheckRollup?: { state?: string } | null } }[] };
}

/**
 * Whether an approved pull request is now waiting on its author, and on what.
 *
 * Null whenever it is not the author's move - other reviewers still asked, a required review
 * still missing, checks still running, a draft - and whenever we could not tell. Both mean the
 * same thing to the caller: send the plain review poke instead. Saying "ready to merge" about a
 * pull request that is not is worse than not saying it.
 *
 * Asked fresh every time rather than cached: the answer changes with every push and every check.
 */
@Injectable()
export class GithubMergeReadinessDataService {
  private readonly logger = new Logger(GithubMergeReadinessDataService.name);

  constructor(
    private readonly tokenService: GithubAppTokenService,
    private readonly metrics: MetricsService,
  ) {}

  public async read(
    installationId: string,
    owner: string,
    name: string,
    number: number,
  ): Promise<MergeReadiness | null> {
    const first = await this.query(installationId, owner, name, number);

    if (first?.mergeable !== 'UNKNOWN') {
      return first ? readinessOf(first) : null;
    }

    await new Promise((resolve) => setTimeout(resolve, UNKNOWN_RETRY_MS));

    const second = await this.query(installationId, owner, name, number);

    return second ? readinessOf(second) : null;
  }

  private async query(
    installationId: string,
    owner: string,
    name: string,
    number: number,
  ): Promise<PullRequestState | null> {
    const token = await this.tokenService.read(installationId);

    if (!token) {
      return null;
    }

    let response: Response;

    try {
      response = await githubFetch(
        this.metrics,
        'graphql_merge_readiness',
        'https://api.github.com/graphql',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: QUERY, variables: { owner, name, number } }),
        },
      );
    } catch (error) {
      this.logger.warn(`Could not reach GitHub about ${owner}/${name}#${number}: ${error}`);
      return null;
    }

    if (!response.ok) {
      this.logger.debug(`No merge state for ${owner}/${name}#${number} (${response.status})`);
      return null;
    }

    const body = await response.json();

    // Any error at all, including a partial answer. The likely one is the app lacking the
    // permission to read checks, which comes back as data with the check state blanked out -
    // and a blank check state reads exactly like "this repository has no checks".
    if (body?.errors?.length) {
      this.logger.debug(
        `Merge state for ${owner}/${name}#${number} came with errors: ` +
          JSON.stringify(body.errors).slice(0, 300),
      );
      return null;
    }

    return body?.data?.repository?.pullRequest ?? null;
  }
}

/** Exported for the spec: every rule here is a case somebody would otherwise be poked wrongly in. */
export function readinessOf(pullRequest: PullRequestState): MergeReadiness | null {
  if (pullRequest.state !== 'OPEN' || pullRequest.isDraft) {
    return null;
  }

  // Somebody is still asked. Whether or not branch protection needs them, the author is
  // waiting on them rather than the other way round.
  if ((pullRequest.reviewRequests?.totalCount ?? 0) > 0) {
    return null;
  }

  // Null is a repository that requires no reviews, where the approval that brought us here is
  // enough. Anything other than approved is still on the reviewers.
  if (pullRequest.reviewDecision && pullRequest.reviewDecision !== 'APPROVED') {
    return null;
  }

  if (pullRequest.mergeable === 'CONFLICTING') {
    return 'conflicts';
  }

  if (pullRequest.mergeable !== 'MERGEABLE') {
    return null;
  }

  const checks = pullRequest.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;

  if (checks === 'FAILURE' || checks === 'ERROR') {
    return 'failing';
  }

  // Null is a commit with no checks at all, which is ready the moment it is approved.
  if (checks === undefined || checks === 'SUCCESS') {
    return 'ready';
  }

  // PENDING, EXPECTED: CI is still going, and nobody is waiting on the author yet.
  return null;
}
