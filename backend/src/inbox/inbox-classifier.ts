import {
  GithubInboxPullRequest,
  GithubInbox,
} from './github-inbox-data.service';
import { InboxFilters } from './core/entities/inbox-filters.interface';
import {
  InboxPullRequest,
  InboxSectionContent,
  InboxSectionKey,
  WAITING_SECTIONS,
  YOURS_SECTIONS,
} from './core/entities/inbox.interface';

/**
 * Where every pull request goes, and in what order within a pile.
 *
 * Pure, and kept apart from both the fetch and the store, because these are the rules people
 * will argue about - "is an approved pull request with one stray open thread approved?" - and an
 * argument is easier to have against a function than against a GraphQL string.
 */

/**
 * How long a draft counts as work in progress rather than as something put down.
 *
 * A day, because that is the span that survives an evening and a night: a draft pushed at six
 * and opened again at nine the next morning is the same piece of work, and anything shorter
 * would file it away overnight.
 */
const RECENT_DRAFT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The order matters and is not the display order.
 *
 * Drafts first because a draft is a draft whatever else is true of it. Then unresolved threads,
 * *above* approved: a pull request that has been signed off and still has an open question on it
 * is one where somebody is waiting on an answer, and "Approved" would tell the reader there is
 * nothing left to do. Everything else has simply not been looked at yet.
 *
 * The drafts split in two on nothing but recency. A draft you pushed to this morning is what you
 * are working on, and it is the one thing in this pile with any claim on your attention today;
 * the eleven you opened in March are a pile, and the point of a pile is that it stays shut. Same
 * rule, two headings, so the client can open one of them by default without opening the other.
 */
function yoursSection(pullRequest: GithubInboxPullRequest, now: number): InboxSectionKey {
  if (pullRequest.isDraft) {
    return now - updatedMs(pullRequest) < RECENT_DRAFT_WINDOW_MS
      ? InboxSectionKey.RecentDrafts
      : InboxSectionKey.Drafts;
  }

  if (pullRequest.hasUnresolvedThreads) {
    return InboxSectionKey.UnresolvedComments;
  }

  if (pullRequest.reviewDecision === 'APPROVED') {
    return InboxSectionKey.Approved;
  }

  return InboxSectionKey.WaitingForReviewers;
}

/**
 * Bots before teammates, deliberately: a machine that happens to be a member of a team is still
 * a machine, and the point of the bots pile is that nothing in it is a person waiting.
 */
function waitingSection(
  pullRequest: GithubInboxPullRequest,
  teammates: Set<string> | null,
): InboxSectionKey {
  if (pullRequest.authorIsBot) {
    return InboxSectionKey.Bots;
  }

  // Null is "we could not ask", not "you have no teammates" - so everyone human falls through to
  // the middle pile rather than being wrongly promoted to the top one.
  if (teammates?.has(pullRequest.authorLogin.toLowerCase())) {
    return InboxSectionKey.Team;
  }

  return InboxSectionKey.Others;
}

/**
 * Most recently updated first, within every section.
 *
 * On GitHub's `updatedAt`, which is the field GitHub sorts its own lists by and the same one the
 * search behind this is asked to order on - so the page and the query agree about what "top of
 * the list" means, and the fifty rows the query returns are the fifty the page wants.
 *
 * This replaced oldest-created-first, which was standing in for how long you had been waiting.
 * It read well on the waiting-on-you half and badly everywhere else: a pull request somebody
 * pushed to ten minutes ago sat at the bottom of the pile under one they had abandoned in March,
 * and nothing on screen said why. Recency is the thing both halves have in common - what moved
 * last is what is live.
 */
function byRecency(a: GithubInboxPullRequest, b: GithubInboxPullRequest): number {
  const byUpdated = updatedMs(b) - updatedMs(a);

  // Ties are two rows written in the same second, so the newer pull request goes on top for the
  // same reason the newer update does.
  return byUpdated === 0 ? b.number - a.number : byUpdated;
}

/**
 * `updatedAt` as epoch milliseconds, and 0 where GitHub sent nothing that parses.
 *
 * Zero rather than NaN on purpose: a comparator that returns NaN gives a sort no ordering at all
 * and the result is engine-defined. This way an unreadable timestamp costs that one row its
 * place - it sorts to the bottom, and is never counted as a recent draft - and costs the rest
 * of the section nothing.
 */
function updatedMs(pullRequest: GithubInboxPullRequest): number {
  const parsed = Date.parse(pullRequest.updatedAt || '');

  return Number.isNaN(parsed) ? 0 : parsed;
}

function toPullRequest(pullRequest: GithubInboxPullRequest): InboxPullRequest {
  return {
    id: pullRequest.id,
    number: pullRequest.number,
    title: pullRequest.title,
    url: pullRequest.url,
    isDraft: pullRequest.isDraft,
    repositoryId: pullRequest.repositoryId,
    repositoryFullName: pullRequest.repositoryFullName,
    author: {
      login: pullRequest.authorLogin,
      avatarUrl: pullRequest.authorAvatarUrl,
    },
  };
}

/**
 * Every section is present, empty ones included.
 *
 * The client renders headings from this list, so a section that vanished when it emptied would
 * make the page reshuffle as work is finished - and "Approved: nothing" is a useful thing to be
 * told, where a missing heading is just a gap.
 */
function group(
  pullRequests: GithubInboxPullRequest[],
  keys: readonly InboxSectionKey[],
  sectionOf: (pullRequest: GithubInboxPullRequest) => InboxSectionKey,
): InboxSectionContent[] {
  const buckets = new Map<InboxSectionKey, GithubInboxPullRequest[]>(
    keys.map((key) => [key, []]),
  );

  for (const pullRequest of pullRequests) {
    buckets.get(sectionOf(pullRequest))?.push(pullRequest);
  }

  return keys.map((key) => ({
    key,
    pullRequests: (buckets.get(key) ?? []).sort(byRecency).map(toPullRequest),
  }));
}

/**
 * Whether somebody else's pull request is still worth putting in front of you.
 *
 * Two rules, and they are different in kind. The first is not negotiable: a pull request you
 * opened and were then asked to review - GitHub allows it, and teams with review assignment on
 * do it - is already sitting under "Yours", and appearing twice would read as two pieces of
 * work.
 *
 * The second is the reader's to make. A pull request whose review decision is already APPROVED
 * has had the thing it was asking for, so by default it leaves the pile; anyone who wants to see
 * them anyway says so once in the settings. Only the *waiting on you* half is filtered - your
 * own approved pull requests are the ones with a button left to press, which is the opposite of
 * finished.
 *
 * Note what APPROVED does not mean: it is GitHub's decision for the pull request, not a record
 * of whether *you* reviewed it. A pull request approved by a colleague while your review is
 * still outstanding is exactly the case this filter is for.
 */
function isWaitingOnYou(
  pullRequest: GithubInboxPullRequest,
  viewerLogin: string,
  filters: InboxFilters,
): boolean {
  if (pullRequest.authorLogin.toLowerCase() === viewerLogin.toLowerCase()) {
    return false;
  }

  return filters.includeApproved || pullRequest.reviewDecision !== 'APPROVED';
}

/**
 * `now` is a parameter rather than a `Date.now()` inside, so that the one rule here that depends
 * on the clock - which drafts are recent - can be asserted against a fixed one.
 */
export function classify(
  inbox: GithubInbox,
  teammates: Set<string> | null,
  filters: InboxFilters,
  now: number = Date.now(),
): { yours: InboxSectionContent[]; waitingOnYou: InboxSectionContent[] } {
  return {
    yours: group(inbox.yours, YOURS_SECTIONS, (pullRequest) => yoursSection(pullRequest, now)),
    waitingOnYou: group(
      inbox.waitingOnYou.filter((pullRequest) =>
        isWaitingOnYou(pullRequest, inbox.viewerLogin, filters),
      ),
      WAITING_SECTIONS,
      (pullRequest) => waitingSection(pullRequest, teammates),
    ),
  };
}
