import { Injectable } from '@nestjs/common';
import { InMemoryCacheService } from '../shared/cache/in-memory-cache.service';

/**
 * The same two hours the author cache next door keeps, and for the same reason: it is the span a
 * review thread is realistically still being replied in. Past it the thread goes quiet in here
 * before it goes quiet on GitHub, which costs a poke rather than sending a wrong one.
 */
const PARTICIPANTS_TTL_MS = 2 * 60 * 60_000;

/**
 * Everybody who has spoken in a review thread, besides whoever opened it.
 *
 * Exists because GitHub points every reply in a thread at the comment that *started* it and at
 * nothing else. `in_reply_to_id` names one person, so a reply routed from the payload alone
 * reaches the person who opened the thread and nobody else who has been talking in it - which is
 * the one participant least likely to still be waiting on an answer.
 *
 * Deliberately not the thread's full membership: the person who opened it is answered exactly,
 * by id, out of {@link GithubCommentAuthorDataService}, and duplicating them here would mean two
 * places that have to agree about the same person. This holds the repliers and only the repliers,
 * and the router takes the union.
 *
 * Written from the webhook for each reply as it happens and never fetched. Unlike the author
 * next door there is no lookup to fall back on - GitHub serves a single comment exactly, but a
 * thread's participants only come out of the pull request's whole comment list, which is
 * paginated and stale the moment it is cached. So this knows about threads that have been
 * replied to while this process has been up, and says nothing about the rest. A thread it has
 * never seen falls back to the person who opened it, which is exactly the behaviour that was
 * here before it - a miss costs the wider reach, never the poke.
 */
@Injectable()
export class GithubThreadParticipantsDataService {
  constructor(private readonly cache: InMemoryCacheService) {}

  /**
   * Notes that somebody has spoken in a thread.
   *
   * `rootCommentId` is the comment that opened it, which is what GitHub puts in `in_reply_to_id`
   * on every reply regardless of how deep the thread has got.
   *
   * Appends rather than replaces: the whole point is that the fourth reply reaches the people who
   * wrote the first three.
   */
  public remember(
    owner: string,
    name: string,
    rootCommentId: string | undefined,
    githubId: string | undefined,
  ): void {
    if (!rootCommentId || !githubId) {
      return;
    }

    const cacheKey = key(owner, name, rootCommentId);
    const known = this.cache.get<string[]>(cacheKey) ?? [];

    if (known.includes(githubId)) {
      // Re-setting would restart the TTL on somebody who has not said anything new, and the
      // clock is meant to measure the thread rather than the loudest person in it.
      return;
    }

    this.cache.set(cacheKey, [...known, githubId], PARTICIPANTS_TTL_MS);
  }

  /** Empty for a thread nothing has been seen in - "nobody known", never "nobody". */
  public read(owner: string, name: string, rootCommentId: string): string[] {
    return this.cache.get<string[]>(key(owner, name, rootCommentId)) ?? [];
  }
}

/**
 * Scoped by repository for the reason the author cache is: GitHub's review comment ids do not
 * collide across repositories, and the cost of being wrong about that is somebody's private
 * thread relayed to a stranger.
 */
function key(owner: string, name: string, rootCommentId: string): string {
  return `github:thread-participants:${owner.toLowerCase()}/${name.toLowerCase()}#${rootCommentId}`;
}
