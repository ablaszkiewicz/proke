import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../analytics/metrics.service';
import { githubFetch } from '../shared/http/github-fetch';

/**
 * What GitHub says about one pull request, before anything has decided where it belongs.
 *
 * Richer than InboxPullRequest on purpose - the three extra fields exist only so the classifier
 * can bucket the row, and none of them leaves this module.
 */
export interface GithubInboxPullRequest {
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  createdAt: string;
  repositoryId: string;
  repositoryFullName: string;
  authorLogin: string;
  authorAvatarUrl?: string;
  /** GitHub calls a GitHub App's account a Bot. The suffix check is the belt to that brace. */
  authorIsBot: boolean;
  /** APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED, or absent where GitHub has no opinion. */
  reviewDecision?: string;
  /** Whether any review thread is still open. Only asked for on the viewer's own pull requests. */
  hasUnresolvedThreads: boolean;
}

export interface GithubInbox {
  viewerLogin: string;
  yours: GithubInboxPullRequest[];
  waitingOnYou: GithubInboxPullRequest[];
}

/** GitHub rejects the token. Its own type so callers can say which credential died. */
export class GithubInboxTokenRejectedError extends Error {
  constructor() {
    super('GitHub rejected the stored access token');
    this.name = 'GithubInboxTokenRejectedError';
  }
}

/** Past this many of your own open pull requests, the sections stop being a list of work. */
const MAX_YOURS = 50;
const MAX_WAITING = 50;
/** Enough to answer "is anything still open" without paying for a hundred nodes per row. */
const MAX_THREADS = 30;

/**
 * Both halves of the inbox, in one request.
 *
 * GraphQL rather than REST for one reason that matters: the review decision, the thread states
 * and the repository all arrive with the search results, where REST would need a follow-up call
 * per pull request. Measured against a real account this costs a single point of the 5,000 an
 * hour a user has - so the refresher this is built for can run every minute and spend about
 * one percent of one person's budget doing it.
 *
 * The budget is per user and not pooled: user-to-server requests bill the authenticated user,
 * shared with whatever else acts on their behalf, and never the organisation. Which is the whole
 * argument for asking as the user here rather than as the installation - that, and the fact that
 * GitHub then applies their visibility for us and we do not have to reimplement it.
 *
 * What a user token can see is the intersection of what they can reach and where this app is
 * installed. A private repository in an org without proke is invisible, silently, and the client
 * says so rather than pretending the list is everything.
 */
@Injectable()
export class GithubInboxDataService {
  private readonly logger = new Logger(GithubInboxDataService.name);

  constructor(private readonly metrics: MetricsService) {}

  /** Null where GitHub could not be asked. Never an empty inbox - those read very differently. */
  public async read(accessToken: string): Promise<GithubInbox | null> {
    let response: Response;

    try {
      response = await githubFetch(this.metrics, 'graphql_inbox', 'https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: INBOX_QUERY,
          variables: { yours: MAX_YOURS, waiting: MAX_WAITING, threads: MAX_THREADS },
        }),
      });
    } catch (error) {
      this.logger.warn(`Could not reach GitHub for an inbox: ${error}`);
      return null;
    }

    if (response.status === 401) {
      throw new GithubInboxTokenRejectedError();
    }

    if (!response.ok) {
      this.logger.warn(`GitHub answered ${response.status} for an inbox query`);
      return null;
    }

    const body = await response.json();

    // GraphQL reports most failures with a 200 and an errors array, so the status is no help.
    // Partial data is still data: a search that failed for one half should not lose the other.
    if (Array.isArray(body?.errors) && body.errors.length > 0) {
      this.logger.warn(
        `GitHub returned GraphQL errors for an inbox: ${body.errors
          .map((error: any) => error?.message)
          .join('; ')}`,
      );
    }

    const viewerLogin = body?.data?.viewer?.login;

    if (!viewerLogin) {
      return null;
    }

    return {
      viewerLogin,
      yours: normalizeSearch(body?.data?.yours),
      waitingOnYou: normalizeSearch(body?.data?.waitingOnYou),
    };
  }
}

function normalizeSearch(search: any): GithubInboxPullRequest[] {
  if (!Array.isArray(search?.nodes)) {
    return [];
  }

  return search.nodes
    .filter((node: any) => node?.id && node?.repository?.nameWithOwner)
    .map((node: any): GithubInboxPullRequest => {
      const login = node.author?.login ?? 'ghost';

      return {
        id: node.id,
        number: node.number,
        title: node.title ?? '',
        url: node.url ?? '',
        isDraft: Boolean(node.isDraft),
        createdAt: node.createdAt ?? '',
        repositoryId: node.repository.id,
        repositoryFullName: node.repository.nameWithOwner,
        authorLogin: login,
        authorAvatarUrl: node.author?.avatarUrl,
        authorIsBot: node.author?.__typename === 'Bot' || /\[bot\]$/i.test(login),
        reviewDecision: node.reviewDecision ?? undefined,
        hasUnresolvedThreads: Boolean(
          node.reviewThreads?.nodes?.some((thread: any) => thread?.isResolved === false),
        ),
      };
    });
}

/**
 * `archived:false` because a pull request in an archived repository cannot be merged or reviewed,
 * and `is:pr` because a GitHub App user token is refused a search that could return both issues
 * and pull requests.
 *
 * Only the viewer's own half asks for review threads. On somebody else's pull request the state
 * of their threads is not what decides where the row goes, and thirty nodes each would be the
 * most expensive thing in the query for no answer.
 */
const INBOX_QUERY = `
query Inbox($yours: Int!, $waiting: Int!, $threads: Int!) {
  viewer { login }
  yours: search(query: "is:open is:pr author:@me archived:false", type: ISSUE, first: $yours) {
    nodes {
      ... on PullRequest {
        ...Row
        reviewDecision
        reviewThreads(first: $threads) { nodes { isResolved } }
      }
    }
  }
  waitingOnYou: search(
    query: "is:open is:pr review-requested:@me archived:false"
    type: ISSUE
    first: $waiting
  ) {
    nodes { ... on PullRequest { ...Row } }
  }
}

fragment Row on PullRequest {
  id
  number
  title
  url
  isDraft
  createdAt
  repository { id nameWithOwner }
  author { __typename login avatarUrl }
}
`;
