import { Injectable } from '@nestjs/common';
import { MetricsService } from '../analytics/metrics.service';
import { InMemoryCacheService } from '../shared/cache/in-memory-cache.service';
import { InboxFilters, inboxFiltersKey } from './core/entities/inbox-filters.interface';
import { InboxSnapshot } from './core/entities/inbox.interface';

/**
 * How long a snapshot is worth painting a page with.
 *
 * Not a correctness bound - the client corrects whatever it is given within a second, so even a
 * very old snapshot is right again almost immediately. It is a bound on how wrong the first
 * frame is allowed to be: past half an hour, a pull request somebody merged before lunch
 * flashing back onto the screen is worse than an empty column for one second.
 */
const SNAPSHOT_TTL_MS = 30 * 60_000;

/**
 * Where a built inbox is kept: in this process, and nowhere else.
 *
 * ## Why not the database
 *
 * Because there is nothing in a snapshot that is only here. Every row of it is derived from one
 * GraphQL query, so it satisfies the rule InMemoryCacheService sets for itself - nothing in it
 * may be authoritative, and everything in it has to be a copy of something GitHub can be asked
 * for again. A snapshot is exactly that. Writing it to Mongo bought durability for data whose
 * source of truth is somewhere else entirely, and cost a collection, two services, an index and
 * a TTL sweep to maintain it.
 *
 * ## Why the filters are in the key
 *
 * Because a snapshot is *built* under one set of filters rather than served through them: the
 * rows a filter removes are not in the stored document at all. Two people reading the same
 * account with different settings hold two genuinely different answers, so one key would hand
 * whoever asked second the other's inbox. Keyed this way a change of setting is an ordinary
 * miss, filled by the refresh the client fires at the same moment.
 *
 * The cost of that is one cached document per combination somebody actually uses, which is why
 * filters are booleans a person sets once rather than anything free-form: a filter with an open
 * set of values would multiply this cache by its cardinality, and should be applied when the
 * snapshot is served instead.
 *
 * ## What it all costs, honestly
 *
 * A restart drops every snapshot, so the first person to load the page after a deploy sees an
 * empty column for about a second while their refresh lands, rather than a stale one instantly.
 * And a second replica would start cold rather than sharing what the first one built.
 *
 * Both are the same trade, and it is the right one at this size: the thing being lost is one
 * second of a first paint, and the thing being saved is a durable store for data that expires
 * in thirty minutes anyway.
 *
 * `get`/`set` rather than `wrap`, deliberately. `wrap` fills a miss by loading, and the entire
 * shape of this feature is that reading never calls GitHub - only the refresh does.
 */
@Injectable()
export class InboxStoreService {
  constructor(
    private readonly cache: InMemoryCacheService,
    private readonly metrics: MetricsService,
  ) {}

  public read(userId: string, filters: InboxFilters): InboxSnapshot | null {
    const snapshot = this.cache.get<InboxSnapshot>(key(userId, filters)) ?? null;

    // The closest thing there is to a measure of how often this page paints instantly. A miss is
    // a person watching an empty column until GitHub answers, and if that stops being rare it is
    // either the sweep having stopped or the process restarting more than anybody thinks.
    //
    // Undimensioned by filters on purpose. What this is watching for is the snapshot mechanism
    // failing, and splitting the series by setting would only make each one smaller and every
    // one of them harder to read.
    this.metrics.count('proke.cache.lookups', {
      namespace: 'inbox-snapshot',
      result: snapshot ? 'hit' : 'miss',
    });

    return snapshot;
  }

  /** Filed under the filters it was built with, which the snapshot carries for exactly this. */
  public write(snapshot: InboxSnapshot): void {
    this.cache.set(key(snapshot.userId, snapshot.filters), snapshot, SNAPSHOT_TTL_MS);
  }

  /**
   * For a user being deleted, and for anything else that should not answer from a stale build.
   *
   * By prefix rather than by key: one person has as many snapshots as they have combinations of
   * settings, and forgetting only the default one would leave the rest to be served afterwards.
   */
  public forget(userId: string): void {
    this.cache.deleteByPrefix(prefix(userId));
  }
}

/**
 * Namespaced `github:` like every other key in this cache, because that is what it is a copy of.
 * The middle segment is what the cache metric labels on, so it has to stay in CACHE_NAMESPACES -
 * and anything appended after the user id leaves that segment alone.
 */
function prefix(userId: string): string {
  return `github:inbox-snapshot:${userId}:`;
}

function key(userId: string, filters: InboxFilters): string {
  return `${prefix(userId)}${inboxFiltersKey(filters)}`;
}
