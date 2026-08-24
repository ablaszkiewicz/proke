import { Injectable } from '@nestjs/common';
import { InboxFilters } from './core/entities/inbox-filters.interface';
import {
  InboxSectionContent,
  InboxSectionKey,
  InboxSnapshot,
  WAITING_SECTIONS,
  YOURS_SECTIONS,
} from './core/entities/inbox.interface';
import { InboxResponse } from './dto/inbox.response';
import { InboxRefreshService } from './inbox-refresh.service';
import { InboxStoreService } from './inbox-store.service';

/**
 * The two halves of what the endpoint offers, and the reason they are two.
 *
 * `read` never touches GitHub. Not "usually does not" - never. It is a map lookup in this
 * process, so the page has something on screen in a millisecond, and the client then asks for
 * `refresh` behind the rows it is already showing.
 *
 * That split replaced a read that refreshed itself whenever the snapshot passed a minute old,
 * which meant the first load after any gap paid a GitHub round trip before rendering anything.
 * Fast most of the time and slow unpredictably is worse than fast always plus a visible refresh:
 * the reader can start on the top of the list either way, and now they always can.
 *
 * The scheduled sweep that is coming does not change this. It writes the same document, so it
 * only makes the client's `refresh` a no-op most of the time.
 */
@Injectable()
export class InboxService {
  constructor(
    private readonly inboxStoreService: InboxStoreService,
    private readonly inboxRefreshService: InboxRefreshService,
  ) {}

  /**
   * Whatever was last written down, however old.
   *
   * No staleness check on purpose: age is the client's to judge, and it has `refreshedAt` to
   * judge it with. An absent `refreshedAt` is the one thing worth reading closely - it means
   * nothing has been built for this person *in this process*, which covers a first-ever visit,
   * the first visit after a deploy, and the first read after they changed a filter. Either way
   * it is "not known yet" rather than "nothing to do", and the client says so.
   */
  public async readForUser(userId: string, filters: InboxFilters): Promise<InboxResponse> {
    const stored = this.inboxStoreService.read(userId, filters);

    return stored
      ? respond(stored, { stale: false, githubReauthRequired: false })
      : blank({ stale: false, githubReauthRequired: false });
  }

  /** Goes and asks GitHub. The only path in this module that costs a request. */
  public async refreshForUser(userId: string, filters: InboxFilters): Promise<InboxResponse> {
    const refreshed = await this.inboxRefreshService.refresh(userId, filters);

    if (refreshed.ok) {
      return respond(refreshed.snapshot, { stale: false, githubReauthRequired: false });
    }

    const githubReauthRequired = refreshed.reason === 'no-token';
    const stored = this.inboxStoreService.read(userId, filters);

    // Something the user has seen before beats an empty page, every time. The rows are real -
    // they were true when GitHub last answered - so they go out with `stale` set rather than
    // being thrown away because the refresh behind them did not land.
    if (stored) {
      return respond(stored, { stale: true, githubReauthRequired });
    }

    return blank({ stale: false, githubReauthRequired });
  }
}

function respond(
  snapshot: InboxSnapshot,
  flags: { stale: boolean; githubReauthRequired: boolean },
): InboxResponse {
  return {
    refreshedAt: snapshot.refreshedAt.toISOString(),
    ...flags,
    // Filled out against the canonical list rather than passed through, so a snapshot written by
    // an older deploy - before a section existed - still answers with every heading the client
    // knows how to draw.
    yours: fill(snapshot.yours, YOURS_SECTIONS),
    waitingOnYou: fill(snapshot.waitingOnYou, WAITING_SECTIONS),
  };
}

/** Every section, empty, and no `refreshedAt` - which is what says this is not an answer yet. */
function blank(flags: { stale: boolean; githubReauthRequired: boolean }): InboxResponse {
  return {
    ...flags,
    yours: empty(YOURS_SECTIONS),
    waitingOnYou: empty(WAITING_SECTIONS),
  };
}

function fill(
  sections: InboxSectionContent[],
  keys: readonly InboxSectionKey[],
): InboxSectionContent[] {
  const byKey = new Map(sections.map((section) => [section.key, section]));

  return keys.map((key) => byKey.get(key) ?? { key, pullRequests: [] });
}

function empty(keys: readonly InboxSectionKey[]): InboxSectionContent[] {
  return keys.map((key) => ({ key, pullRequests: [] }));
}
