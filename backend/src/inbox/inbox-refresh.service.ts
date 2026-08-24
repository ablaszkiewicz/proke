import { Injectable, Logger } from '@nestjs/common';
import { UserReadService } from '../user/read/user-read.service';
import { UserWriteService } from '../user/write/user-write.service';
import { InboxFilters } from './core/entities/inbox-filters.interface';
import { InboxSnapshot } from './core/entities/inbox.interface';
import {
  GithubInboxDataService,
  GithubInboxTokenRejectedError,
} from './github-inbox-data.service';
import { GithubViewerTeammatesDataService } from './github-viewer-teammates-data.service';
import { classify } from './inbox-classifier';
import { InboxStoreService } from './inbox-store.service';

/** Why a refresh produced nothing, where the difference changes what the caller should say. */
export type InboxRefreshFailure = 'no-token' | 'github-unavailable';

export type InboxRefreshResult =
  | { ok: true; snapshot: InboxSnapshot }
  | { ok: false; reason: InboxRefreshFailure };

/**
 * Builds one person's inbox and writes it down.
 *
 * The only thing that talks to GitHub, and deliberately the only thing - so that the endpoint and
 * the scheduled sweep that is coming are the same code path with different triggers. When the
 * refresher starts running every minute, it calls this and nothing else changes: the endpoint
 * keeps reading the document this wrote, and simply stops ever finding it cold.
 *
 * Two GitHub calls at most, and the second is usually a cache hit: one GraphQL query for both
 * halves of the inbox, and the teammate list that separates your team from everyone else. That
 * is roughly one point of a user's 5,000-an-hour GraphQL budget - a per-user budget, not a
 * per-organisation one - which is what makes a once-a-minute sweep affordable at all.
 *
 * The snapshot it writes lives in this process only, filed under the filters it was built with.
 * See InboxStoreService for why both of those are so, and what they cost.
 *
 * The filters change what is written, never what is asked for: the same GitHub answer is
 * classified differently under different settings. Which means the sweep can refresh somebody
 * under one set of filters for the price of one query and, if it ever needs to, write a second
 * snapshot under another for free.
 */
@Injectable()
export class InboxRefreshService {
  private readonly logger = new Logger(InboxRefreshService.name);

  constructor(
    private readonly userReadService: UserReadService,
    private readonly userWriteService: UserWriteService,
    private readonly inboxDataService: GithubInboxDataService,
    private readonly teammatesDataService: GithubViewerTeammatesDataService,
    private readonly inboxStoreService: InboxStoreService,
  ) {}

  public async refresh(userId: string, filters: InboxFilters): Promise<InboxRefreshResult> {
    const user = await this.userReadService.readByIdOrThrow(userId);

    if (!user.githubAccessToken) {
      return { ok: false, reason: 'no-token' };
    }

    const accessToken = user.githubAccessToken;

    let inbox: Awaited<ReturnType<GithubInboxDataService['read']>>;

    try {
      inbox = await this.inboxDataService.read(accessToken);
    } catch (error) {
      if (!(error instanceof GithubInboxTokenRejectedError)) {
        throw error;
      }

      // The user revoked proke on GitHub's side. Their proke session is fine, so this must not
      // become a 401 - the dashboard reads that as "you are signed out". Drop the dead token so
      // it is not presented again on every sweep, and report the one thing they can fix.
      this.logger.warn(`GitHub rejected the stored token for user ${userId}; clearing it`);
      await this.userWriteService.clearGithubAccessToken(userId);

      return { ok: false, reason: 'no-token' };
    }

    if (!inbox) {
      return { ok: false, reason: 'github-unavailable' };
    }

    // Not awaited alongside the inbox query on purpose: this one is allowed to fail. A null
    // teammate list costs a worse grouping, and nothing else.
    const teammates = await this.teammatesDataService.read(userId, accessToken);

    const snapshot: InboxSnapshot = {
      userId,
      refreshedAt: new Date(),
      filters,
      ...classify(inbox, teammates, filters),
    };

    this.inboxStoreService.write(snapshot);

    return { ok: true, snapshot };
  }
}
