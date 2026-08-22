/**
 * Which pile a pull request landed in, and in what order the piles are read.
 *
 * The server decides this rather than the client, because every rule behind it needs something
 * the browser does not have: whether a review thread is still open, whether the author is a
 * teammate, whether the author is a machine. The client owns the words on the heading and
 * nothing else.
 */
export enum InboxSectionKey {
  /** Yours: signed off, nothing left to do but press the button. */
  Approved = 'approved',
  /** Yours: at least one review thread is still open. Someone is waiting on you. */
  UnresolvedComments = 'unresolved-comments',
  /** Yours: nobody has said anything yet. */
  WaitingForReviewers = 'waiting-for-reviewers',
  /** Yours: a note to yourself. Asking nothing of anyone. */
  Drafts = 'drafts',
  /** Waiting on you: written by someone you share a GitHub team with. */
  Team = 'team',
  /** Waiting on you: written by a person you do not. */
  Others = 'others',
  /** Waiting on you: written by a machine. */
  Bots = 'bots',
}

export const YOURS_SECTIONS = [
  InboxSectionKey.Approved,
  InboxSectionKey.UnresolvedComments,
  InboxSectionKey.WaitingForReviewers,
  InboxSectionKey.Drafts,
] as const;

export const WAITING_SECTIONS = [
  InboxSectionKey.Team,
  InboxSectionKey.Others,
  InboxSectionKey.Bots,
] as const;

export interface InboxAuthor {
  login: string;
  avatarUrl?: string;
}

/**
 * One pull request, carrying exactly what a row renders.
 *
 * Deliberately narrower than what GitHub was asked for. The query behind this also pulls the
 * review decision, the check rollup and the thread states, because the classifier needs them -
 * so surfacing any of those later is a field on this interface rather than another API call.
 */
export interface InboxPullRequest {
  /** GitHub's node id. Survives a rename of the repository or of the author. */
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  repositoryId: string;
  repositoryFullName: string;
  author: InboxAuthor;
}

export interface InboxSectionContent {
  key: InboxSectionKey;
  /** Server-ordered. The client renders them in the order it is given. */
  pullRequests: InboxPullRequest[];
}

/**
 * Everything one person's inbox holds, as of one moment.
 *
 * A whole snapshot rather than a set of rows, because that is how it is produced: one GraphQL
 * query answers the complete truth for a user, and there is nothing to merge incrementally. The
 * refresher replaces the document; the endpoint reads it.
 */
export interface InboxSnapshot {
  userId: string;
  refreshedAt: Date;
  yours: InboxSectionContent[];
  waitingOnYou: InboxSectionContent[];
}
