import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { CacheResult, cacheNamespaceLabel } from '../../analytics/metrics-catalog';
import { MetricsService } from '../../analytics/metrics.service';

/** A function where the answer depends on what was loaded - a failure is worth a shorter one. */
export type CacheTtl<T> = number | ((value: T) => number);

const SWEEP_INTERVAL_MS = 60_000;
const MAX_ENTRIES = 10_000;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * A TTL cache that lives in this process and nowhere else.
 *
 * Nothing in here may be authoritative: a restart drops the lot, and a second replica never had
 * it. Everything cached has to be a copy of something GitHub, Slack or Mongo can be asked for
 * again - which is also why this is not Redis. A dependency that has to be up before a webhook
 * can be routed costs more than the duplicate calls it would save.
 */
@Injectable()
export class InMemoryCacheService implements OnModuleDestroy {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(private readonly metrics: MetricsService) {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    // Or the timer alone keeps the process - and every jest run - alive.
    this.sweeper.unref?.();
  }

  public onModuleDestroy(): void {
    clearInterval(this.sweeper);
  }

  /**
   * Callers asking for the same key while a load is in flight share it, rather than each
   * starting their own. That is the whole reason this exists rather than get-then-set.
   *
   * A rejected load caches nothing, so a blip costs one retry instead of a whole TTL of
   * silence. Anything that wants a failure remembered should resolve to null rather than throw.
   */
  public async wrap<T>(key: string, ttl: CacheTtl<T>, load: () => Promise<T>): Promise<T> {
    const hit = this.read<T>(key);

    if (hit) {
      this.lookup(key, 'hit');
      return hit.value;
    }

    const pending = this.inFlight.get(key) as Promise<T> | undefined;

    if (pending) {
      // Neither a hit nor a miss: a caller that arrived while the same key was already loading.
      // Counted apart from both because deduplicating these is the entire reason this method
      // exists rather than get-then-set, and a review thread being commented on is exactly when
      // it pays - one GitHub call for everybody the event reaches instead of one each.
      this.lookup(key, 'coalesced');
      return pending;
    }

    this.lookup(key, 'miss');

    const loading = load()
      .then((value) => {
        this.set(key, value, typeof ttl === 'function' ? ttl(value) : ttl);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, loading);

    return loading;
  }

  /** Undefined for a miss and for a cached undefined alike. Cache null and use `wrap` instead. */
  public get<T>(key: string): T | undefined {
    return this.read<T>(key)?.value;
  }

  /** A ttl of zero or less is a refusal to cache, not an instant expiry. */
  public set<T>(key: string, value: T, ttlMs: number): void {
    this.entries.delete(key);

    if (ttlMs <= 0) {
      return;
    }

    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });

    if (this.entries.size > MAX_ENTRIES) {
      this.evict();
    }
  }

  public delete(key: string): void {
    this.entries.delete(key);
  }

  /** Including loads in flight. For tests, so one spec cannot prime the next. */
  public clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  /**
   * The hit rate, by what was being cached.
   *
   * Reads as bookkeeping and is not: almost every key here stands for a GitHub API call, so this
   * is the closest thing proke has to a measure of what it is costing its rate limit. When
   * `proke.github.request.duration` starts showing more calls than the traffic explains, this is
   * the metric that says which cache stopped working and why.
   *
   * The namespace is taken from the key and then checked against a known list, never trusted -
   * the rest of every key is a user id, a repository or a comment id.
   */
  private lookup(key: string, result: CacheResult): void {
    this.metrics.count('proke.cache.lookups', {
      namespace: cacheNamespaceLabel(key),
      result,
    });
  }

  private read<T>(key: string): { value: T } | null {
    const entry = this.entries.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    return { value: entry.value as T };
  }

  private sweep(): void {
    const now = Date.now();

    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  /** Stale first, then oldest written - `set` re-inserts, so Map order is roughly that. */
  private evict(): void {
    this.sweep();

    for (const key of this.entries.keys()) {
      if (this.entries.size <= MAX_ENTRIES) {
        return;
      }

      this.entries.delete(key);
    }
  }
}
