import { Injectable, Logger } from '@nestjs/common';
import { InMemoryCacheService } from '../shared/cache/in-memory-cache.service';
import { GithubAppTokenService } from './github-app-token.service';

/**
 * Who wrote a comment never changes, so this is a memory bound rather than a freshness one -
 * unlike the diff next door, where the TTL exists because people push. Two hours covers the
 * span a review thread is realistically still being replied in; past that the answer is fetched
 * again rather than being wrong, so the number is only ever a question of how many GitHub calls
 * we spend, never of what we say.
 */
const AUTHOR_TTL_MS = 2 * 60 * 60_000;

/**
 * Short, and for a different reason: a comment deleted mid-thread stays unresolvable, and a
 * busy thread must not ask about it once per reply. Also covers a transient 500.
 */
const UNRESOLVED_TTL_MS = 60_000;

/**
 * Who wrote a given review comment.
 *
 * Exists because a reply names its parent by id and nothing else: `in_reply_to_id` is a number,
 * and the author it belongs to is not in the payload. Routing a reply to the person being
 * replied to is therefore the one poke whose *recipient* has to be looked up, rather than merely
 * its presentation - which is why this is consulted before preferences rather than after, unlike
 * every other GitHub call in the router.
 *
 * Two ways in, and the cheap one carries almost all of it:
 *
 *  - `remember`, from the webhook for the comment itself. We are already being told about every
 *    review comment as it is written, author included, so a thread started and replied to while
 *    this process is up costs no API call at all.
 *  - `readAuthor`, for everything `remember` could not have seen: a thread older than the
 *    process, a replica that handled the parent, an entry evicted under cache pressure.
 *
 * Keyed per comment rather than per pull request on purpose. A cached list would have to be
 * right about which comments exist, and a reply to a comment written after the list was cached
 * would read as a parent that does not exist - a poke silently dropped, exactly when the feature
 * matters most. Keyed per comment there is no such state: a miss is a miss, and a miss is
 * answered exactly.
 */
@Injectable()
export class GithubCommentAuthorDataService {
  private readonly logger = new Logger(GithubCommentAuthorDataService.name);

  constructor(
    private readonly tokenService: GithubAppTokenService,
    private readonly cache: InMemoryCacheService,
  ) {}

  /**
   * Files away an author we were told about for free.
   *
   * Called for every review comment, not only the ones that start a thread: a reply is itself
   * replied to, and GitHub points every reply in a thread at its root, so today's reply is
   * tomorrow's parent either way.
   */
  public remember(
    owner: string,
    name: string,
    commentId: string | undefined,
    githubId: string | undefined,
  ): void {
    if (!commentId || !githubId) {
      return;
    }

    this.cache.set(key(owner, name, commentId), githubId, AUTHOR_TTL_MS);
  }

  /** Null where we could not establish it - "cannot answer", never "nobody". */
  public async readAuthor(
    installationId: string,
    owner: string,
    name: string,
    commentId: string,
  ): Promise<string | null> {
    return this.cache.wrap<string | null>(
      key(owner, name, commentId),
      (githubId) => (githubId ? AUTHOR_TTL_MS : UNRESOLVED_TTL_MS),
      () => this.read(installationId, owner, name, commentId),
    );
  }

  private async read(
    installationId: string,
    owner: string,
    name: string,
    commentId: string,
  ): Promise<string | null> {
    const token = await this.tokenService.read(installationId);

    if (!token) {
      return null;
    }

    let response: Response;

    try {
      // The single comment, not the pull request's list of them. One call either way in the
      // common case, but this one is exact and unpaginated - a thread on a long-running pull
      // request can sit past the first page of a list, and a parent we failed to page to would
      // look identical to a parent that does not exist.
      response = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}` +
          `/pulls/comments/${encodeURIComponent(commentId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
    } catch (error) {
      this.logger.warn(`Could not reach GitHub about comment ${commentId}: ${error}`);
      return null;
    }

    if (!response.ok) {
      // A deleted parent is a 404 and is expected rather than exceptional - somebody tidying up
      // a thread mid-conversation.
      this.logger.debug(`No author for comment ${commentId} (${response.status})`);
      return null;
    }

    const body = await response.json();
    const githubId = body?.user?.id;

    if (githubId === undefined || githubId === null) {
      this.logger.warn(`Unexpected review comment payload for ${commentId}`);
      return null;
    }

    return String(githubId);
  }
}

/**
 * Scoped by repository even though GitHub's review comment ids do not collide across them. The
 * cost is a longer string; the alternative is that an id which turned out not to be unique
 * relays somebody's private thread to a stranger.
 */
function key(owner: string, name: string, commentId: string): string {
  return `github:comment-author:${owner.toLowerCase()}/${name.toLowerCase()}#${commentId}`;
}
