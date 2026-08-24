/**
 * What the reader has asked to be shown, and why it is decided here rather than in the browser.
 *
 * A filter looks like a display preference and is not one. "Already approved" needs GitHub's
 * review decision, "touched in the last six hours" needs GitHub's `updatedAt`, and "is this
 * author on one of my teams" needs GitHub's team membership. None of the three is a thing a
 * browser can see. So the client owns the words on the toggle and nothing else, exactly as it
 * owns the words on a section heading and nothing else.
 *
 * ## The two kinds, and why the difference matters
 *
 * A **build** filter is about the pull request: its review decision, when it last moved. Those
 * facts come out of the big GraphQL query and are not kept on the stored row, so a build filter
 * has to be applied while GitHub's answer is still in hand. The snapshot is therefore *built*
 * under them and filed under a key made of them - see InboxStoreService.
 *
 * A **view** filter is about its author: is this a machine, is this someone on my team, is this
 * someone I never want to see. Those facts are small and are kept on the stored row, so a view
 * filter is applied when a stored snapshot is served.
 *
 * That line is not an implementation detail, it is the thing that keeps the cache finite. A key
 * costs one stored inbox per combination, so every filter in it multiplies the store by its
 * cardinality. Two build filters is twelve combinations - a number we can name. `ignoredAuthors`
 * is free text and `excludedTeams` is a subset of a set we do not control, and either one in a
 * key would be as many stored inboxes as somebody thought to type. Kept out of it, they cost
 * nothing at all, and changing one needs no trip to GitHub: the rows are already here.
 *
 * ## Adding one
 *
 * Decide which kind it is by asking what it is about - the pull request, or its author. Then add
 * a field to that interface, its default beside it, a field to InboxFiltersQuery, and the rule
 * itself to the classifier: `classify` for a build filter, `groupWaitingOnYou` for a view one. A
 * view filter also needs whatever fact it reads to be on InboxStoredPullRequest.
 *
 * ## What the names say
 *
 * Names read as what they *include*, never as what they hide. A `hideApproved: false` and an
 * `includeApproved: true` mean the same thing and only one of them can be read aloud.
 *
 * `excludedTeams` and `ignoredAuthors` are the exception, and the reason is not laziness. Their
 * default is *everything*: every team you are in counts, and nobody is ignored. A list of what
 * to include would have to be complete on the day it was written, so the team you join next
 * month would silently not count and nothing on the page would say why. A list of what to remove
 * has no such problem - anything new is simply in.
 */

/**
 * How long a draft counts as work in progress rather than as something put down.
 *
 * The default is a day, because that is the span that survives an evening and a night: a draft
 * pushed at six and opened again at nine the next morning is the same piece of work, and
 * anything shorter would file it away overnight. The rest are here because whose day is whose
 * is not ours to decide - somebody who reviews in the morning wants six hours, and somebody
 * halfway through a fortnight's work wants seven days.
 */
export const RECENT_DRAFT_WINDOW_MS = {
  '6h': 6 * 60 * 60_000,
  '12h': 12 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '3d': 3 * 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
} as const;

export type RecentDraftWindow = keyof typeof RECENT_DRAFT_WINDOW_MS;

export const RECENT_DRAFT_WINDOWS = Object.keys(RECENT_DRAFT_WINDOW_MS) as RecentDraftWindow[];

/**
 * The `recentDrafts` filter: a window, or `off`.
 *
 * `off` is a member of the same field rather than a flag beside it. A separate boolean would
 * let somebody write down a window that is not in force - "off, and by the way, three days" -
 * and every reader of the pair would then have to decide what that meant. Here the invalid
 * state cannot be expressed at all.
 */
export type RecentDrafts = RecentDraftWindow | 'off';

export const RECENT_DRAFTS_VALUES: readonly RecentDrafts[] = ['off', ...RECENT_DRAFT_WINDOWS];

/** About the pull request. Baked into the snapshot, and part of the key it is filed under. */
export interface InboxBuildFilters {
  includeApproved: boolean;
  recentDrafts: RecentDrafts;
}

/** About its author. Applied to a stored snapshot on the way out, and never part of a key. */
export interface InboxViewFilters {
  /**
   * Whether people you share a GitHub team with get a heading of their own. Off puts them in
   * with everyone else, which is what somebody whose teams do not line up with who they review
   * for wants: a grouping that says nothing is worse than no grouping.
   */
  separateTeam: boolean;
  /** The same question about machines. Off puts their pull requests in with everyone else's. */
  separateBots: boolean;
  /**
   * Teams of yours that should not count as yours, by `org/slug`.
   *
   * The default is every team GitHub says you are in, which is right for most people and wrong
   * for anyone in a company-wide team - one of those makes "your team" mean "everybody", and
   * the section stops separating anything. Deselecting it is how they say so.
   */
  excludedTeams: string[];
  /**
   * Logins whose pull requests never reach you, lowercased.
   *
   * The whole row goes, rather than moving to another heading: this is the setting for the bot
   * that opens nine dependency bumps a week, and moving those to another pile is not what
   * somebody who asked to never see them meant.
   *
   * Only the waiting-on-you half can be affected, because the other half is yours by definition
   * and nobody needs a way to ignore themselves.
   */
  ignoredAuthors: string[];
}

/**
 * One reader's choices, complete - never partial. Everything downstream of the controller takes
 * this rather than a query object, so no rule has to decide what an absent filter meant.
 */
export type InboxFilters = InboxBuildFilters & InboxViewFilters;

export type InboxBuildFilterName = keyof InboxBuildFilters;
export type InboxFilterName = keyof InboxFilters;

/** Typed as a window rather than as a `RecentDrafts`, so the default can never be `off`. */
export const DEFAULT_RECENT_DRAFT_WINDOW: RecentDraftWindow = '1d';

/**
 * `includeApproved: false`, because a pull request that is already approved is not waiting on
 * you in any sense that matters - the review it wanted has happened, and leaving it in the pile
 * makes the pile a worse answer to "what is left to do".
 *
 * `recentDrafts` on, because the split is the only thing that makes the drafts pile shuttable:
 * the one you pushed to this morning gets a heading of its own that arrives open, and the
 * eleven from March stay behind one that arrives closed.
 */
export const DEFAULT_BUILD_FILTERS: InboxBuildFilters = {
  includeApproved: false,
  recentDrafts: DEFAULT_RECENT_DRAFT_WINDOW,
};

/**
 * Both headings on, and nothing removed.
 *
 * Every default here is the one that shows the most and assumes the least. Somebody who has
 * never opened the settings gets every pull request that is waiting on them, sorted into the
 * three piles GitHub's own facts suggest - and any of that they disagree with, they turn off.
 * The opposite default would be an inbox quietly missing rows on the strength of a guess.
 */
export const DEFAULT_VIEW_FILTERS: InboxViewFilters = {
  separateTeam: true,
  separateBots: true,
  excludedTeams: [],
  ignoredAuthors: [],
};

export const DEFAULT_INBOX_FILTERS: InboxFilters = {
  ...DEFAULT_BUILD_FILTERS,
  ...DEFAULT_VIEW_FILTERS,
};

/**
 * Every build filter's name, taken from the defaults rather than written out beside them.
 *
 * A second list would be a list to forget: a filter missing from it would be missing from the
 * cache key, and nothing would fail to compile. The defaults are already required to be
 * complete - the object is typed `InboxBuildFilters` - so they are the list.
 *
 * The order is the order they are declared in, which is the order they appear in a cache key.
 * Reordering them costs one round of misses and nothing else.
 */
export const INBOX_BUILD_FILTER_NAMES = Object.keys(
  DEFAULT_BUILD_FILTERS,
) as InboxBuildFilterName[];

/** How far back "recent" reaches, or null where the reader asked for no such distinction. */
export function recentDraftWindowMs(recentDrafts: RecentDrafts): number | null {
  return recentDrafts === 'off' ? null : RECENT_DRAFT_WINDOW_MS[recentDrafts];
}

/**
 * The one spelling everything downstream compares against.
 *
 * GitHub logins and organisation names differ only in case, and the reader typed theirs by
 * hand. Normalising once at the controller means no rule further in has to remember to - and a
 * rule that forgot would be a filter that silently matched nothing, which is the failure nobody
 * reports because it looks like the feature not being on.
 */
export function normalizeFilterList(values: string[]): string[] {
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value.trim().toLowerCase();

    if (normalized) {
      seen.add(normalized);
    }
  }

  return [...seen];
}

/**
 * A short, stable string standing for one set of build choices.
 *
 * Part of a cached snapshot's key, because the snapshot is *built* under these filters - the
 * rows a build filter removes are gone from the stored document, not hidden when it is served.
 * Two readers of the same account with different settings therefore hold two different answers,
 * and a key that ignored the filters would hand one of them the other's.
 *
 * View filters are deliberately absent. They are applied to the stored document on the way out,
 * so two readers with different ones are looking at the same stored answer - and putting them in
 * here would file a separate copy of it per combination, for no difference in what was stored.
 *
 * Every name appears whatever its value, so the key is the same length and the same shape for
 * everybody, and adding a filter cannot make an old key accidentally match a new one.
 */
export function inboxFiltersKey(filters: InboxBuildFilters): string {
  return INBOX_BUILD_FILTER_NAMES.map((name) => `${name}=${keyPart(filters[name])}`).join(',');
}

/**
 * Booleans as 1/0; everything else is already one short word from a closed set, so it goes in
 * as itself. Nothing here escapes anything, which is safe only because of that closed set - a
 * filter whose value could contain a `,` or an `=` would need this to do more than it does, and
 * is a filter that belongs in InboxViewFilters instead.
 */
function keyPart(value: InboxBuildFilters[InboxBuildFilterName]): string {
  return typeof value === 'boolean' ? (value ? '1' : '0') : value;
}
