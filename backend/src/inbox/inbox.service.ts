import { Injectable, Logger } from '@nestjs/common';
import { UserWriteService } from '../user/write/user-write.service';
import { InboxFilters, InboxViewFilters } from './core/entities/inbox-filters.interface';
import {
  InboxSectionContent,
  InboxSectionKey,
  InboxSnapshot,
  WAITING_SECTIONS,
  YOURS_SECTIONS,
} from './core/entities/inbox.interface';
import { groupWaitingOnYou } from './inbox-classifier';
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
 * The scheduled sweep does not change this. It writes the same document, so it only makes the
 * client's `refresh` a no-op most of the time - see InboxWarmerService.
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly inboxStoreService: InboxStoreService,
    private readonly inboxRefreshService: InboxRefreshService,
    private readonly userWriteService: UserWriteService,
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
      ? respond(stored, filters, { stale: false, githubReauthRequired: false })
      : blank({ stale: false, githubReauthRequired: false });
  }

  /** Goes and asks GitHub. The only path in this module that costs a request. */
  public async refreshForUser(userId: string, filters: InboxFilters): Promise<InboxResponse> {
    await this.recordUse(userId);

    const refreshed = await this.inboxRefreshService.refresh(userId, filters);

    if (refreshed.ok) {
      return respond(refreshed.snapshot, filters, { stale: false, githubReauthRequired: false });
    }

    const githubReauthRequired = refreshed.reason === 'no-token';
    const stored = this.inboxStoreService.read(userId, filters);

    // Something the user has seen before beats an empty page, every time. The rows are real -
    // they were true when GitHub last answered - so they go out with `stale` set rather than
    // being thrown away because the refresh behind them did not land.
    if (stored) {
      return respond(stored, filters, { stale: true, githubReauthRequired });
    }

    return blank({ stale: false, githubReauthRequired });
  }

  /** What the page will open on next time, and what the sweep builds meanwhile. */
  public async updateSettingsForUser(userId: string, settings: InboxFilters): Promise<InboxFilters> {
    return this.userWriteService.updateInboxSettings(userId, settings);
  }

  /**
   * What tells the warmer this person wants their inbox kept ready.
   *
   * Stamped here and only here. The sweep calls InboxRefreshService directly, so it can never
   * count as its own reader and keep somebody warm for ever on the strength of having warmed
   * them. Before the GitHub call rather than after, because this is a fact about what the person
   * asked for and not about whether GitHub was up to answer.
   *
   * Never allowed to fail the refresh. A Mongo hiccup here costs a cold first frame some morning;
   * turning it into a 500 would cost the rows the person is waiting for right now.
   */
  private async recordUse(userId: string): Promise<void> {
    try {
      await this.userWriteService.recordInboxUse(userId);
    } catch (error) {
      this.logger.warn(
        `Could not record inbox use for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * A stored snapshot, as this reader has asked to see it.
 *
 * The waiting half is put into headings here rather than having been stored in them, because
 * every rule that decides which heading is a setting somebody can move without anything about
 * GitHub's answer changing - see `groupWaitingOnYou`. It is one pass over fifty rows, and it is
 * what lets a checkbox take effect against the snapshot already in hand.
 */
function respond(
  snapshot: InboxSnapshot,
  filters: InboxViewFilters,
  flags: { stale: boolean; githubReauthRequired: boolean },
): InboxResponse {
  return {
    refreshedAt: snapshot.refreshedAt.toISOString(),
    ...flags,
    // Absent rather than empty where GitHub would not say, so the settings can tell "you are in
    // no teams" apart from "we could not find out" - which are the same picture and opposite
    // instructions to the person reading it.
    teams: snapshot.teams ?? undefined,
    // Filled out against the canonical list rather than passed through, so a snapshot written by
    // an older deploy - before a section existed - still answers with every heading the client
    // knows how to draw.
    yours: fill(snapshot.yours, YOURS_SECTIONS),
    waitingOnYou: fill(groupWaitingOnYou(snapshot.waitingOnYou, filters), WAITING_SECTIONS),
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
