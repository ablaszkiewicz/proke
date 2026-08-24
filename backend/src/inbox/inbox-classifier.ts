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
 * The order matters and is not the display order.
 *
 * Drafts first because a draft is a draft whatever else is true of it. Then unresolved threads,
 * *above* approved: a pull request that has been signed off and still has an open question on it
 * is one where somebody is waiting on an answer, and "Approved" would tell the reader there is
 * nothing left to do. Everything else has simply not been looked at yet.
 */
function yoursSection(pullRequest: GithubInboxPullRequest): InboxSectionKey {
  if (pullRequest.isDraft) {
    return InboxSectionKey.Drafts;
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
 * Oldest first, within every section.
 *
 * A proxy, and an honest one. What this list wants to be sorted by is how long *you* have been
 * asked, which no search result carries - but proke is sent a `review_requested` webhook the
 * moment it happens, so the real number is already arriving and can replace this without the
 * client noticing. Until then, how long the pull request has existed is the closest thing, and
 * it has the property that matters: a bot rebasing its own branch hourly cannot climb over
 * somebody who has been waiting since Tuesday.
 */
function byAgeThenNumber(a: GithubInboxPullRequest, b: GithubInboxPullRequest): number {
  const byAge = Date.parse(a.createdAt || '') - Date.parse(b.createdAt || '');

  return Number.isNaN(byAge) || byAge === 0 ? a.number - b.number : byAge;
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
    pullRequests: (buckets.get(key) ?? []).sort(byAgeThenNumber).map(toPullRequest),
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

export function classify(
  inbox: GithubInbox,
  teammates: Set<string> | null,
  filters: InboxFilters,
): { yours: InboxSectionContent[]; waitingOnYou: InboxSectionContent[] } {
  return {
    yours: group(inbox.yours, YOURS_SECTIONS, yoursSection),
    waitingOnYou: group(
      inbox.waitingOnYou.filter((pullRequest) =>
        isWaitingOnYou(pullRequest, inbox.viewerLogin, filters),
      ),
      WAITING_SECTIONS,
      (pullRequest) => waitingSection(pullRequest, teammates),
    ),
  };
}
