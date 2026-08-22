import { Injectable } from '@nestjs/common';
import {
  InboxSectionContent,
  InboxSectionKey,
  InboxSnapshot,
  WAITING_SECTIONS,
  YOURS_SECTIONS,
} from './core/entities/inbox.interface';
import { InboxResponse } from './dto/inbox.response';
import { InboxRefreshService } from './inbox-refresh.service';
import { InboxReadService } from './read/inbox-read.service';

/**
 * How old a stored snapshot may be before the endpoint goes and gets a new one itself.
 *
 * Matched to the sweep that is coming rather than to anything about the data. Once a refresher
 * is writing every minute this threshold is never crossed, every request is a Mongo read, and
 * this branch quietly stops being reached. Until then it is what keeps the page current, at a
 * cost of at most one GitHub round trip per user per minute.
 */
const STALE_AFTER_MS = 60_000;

/**
 * What the endpoint serves.
 *
 * Read-through, in that order deliberately: the stored snapshot first, GitHub only if there is
 * no usable one. The page must render from Mongo alone - that is the whole point of writing it
 * down - so a GitHub outage costs freshness and never the page.
 */
@Injectable()
export class InboxService {
  constructor(
    private readonly inboxReadService: InboxReadService,
    private readonly inboxRefreshService: InboxRefreshService,
  ) {}

  public async readForUser(userId: string): Promise<InboxResponse> {
    const stored = await this.inboxReadService.read(userId);

    if (stored && Date.now() - stored.refreshedAt.getTime() < STALE_AFTER_MS) {
      return respond(stored, { stale: false, githubReauthRequired: false });
    }

    const refreshed = await this.inboxRefreshService.refresh(userId);

    if (refreshed.ok) {
      return respond(refreshed.snapshot, { stale: false, githubReauthRequired: false });
    }

    const githubReauthRequired = refreshed.reason === 'no-token';

    // Something the user has seen before beats an empty page, every time. The rows are real -
    // they were true when GitHub last answered - so they are served with `stale` set rather than
    // thrown away because the refresh behind them did not land.
    if (stored) {
      return respond(stored, { stale: true, githubReauthRequired });
    }

    return {
      stale: false,
      githubReauthRequired,
      yours: empty(YOURS_SECTIONS),
      waitingOnYou: empty(WAITING_SECTIONS),
    };
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
