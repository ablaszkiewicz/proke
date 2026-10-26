import { ALL_NOTIFICATION_TYPES, NotificationType } from './entities/notification-type.enum';
import { PokeSettings } from './poke-settings';

/**
 * Who counts as a bot to one reader, and what that does to the pokes they get.
 *
 * ## Three answers to "is this a bot", in order
 *
 * The reader's own word first, where their mode reads a list - see BotMode: under `none` an
 * allowed bot is let through as a person would be, whatever GitHub or the name says, and under
 * `all` a blocked one is a bot they never want to hear from, even one that looks human. Then
 * GitHub's, which is exact for a GitHub App and silent about everything else. Then the name, for
 * the machine accounts GitHub cannot see through - a `release-bot` driven by a personal token is
 * a `User` to GitHub, and its comments read to everybody as a colleague talking.
 *
 * The name check is a suffix with its hyphen, `-bot`, and nothing looser: `robotnik`, `abbot`
 * and `talbot` are people.
 *
 * ## What a bot is denied
 *
 * Two rules, set per kind below so a kind added later has to be put under one of them before
 * anything compiles:
 *
 *  - Talking - comments, replies, mentions - never reaches anybody from a bot. That was always
 *    the rule for GitHub Apps; allowing a bot is the one way past it.
 *  - Everything else a bot does - a verdict, a request for one, a merge, auto-merge armed -
 *    reaches them under `all`, and not under `none`. Plenty of people want the approval that
 *    lets them merge, or the merge queue landing their work, whoever did it; plenty want to hear
 *    only from people. So it is theirs to say: anything out of a bot. A blocked bot is denied it
 *    under `all` too, because that is what blocking it says.
 *
 * Silencing bots silences a merge queue's merges too. That is what it says - and somebody who
 * wants those back without the rest picks `none` and allows the queue.
 */

/** An account the way a payload names one: `sender`, `pull_request.user`, `review.user`. */
export interface GithubAccount {
  login?: string;
  type?: string;
}

/**
 * Whether GitHub itself says this is a machine.
 *
 * `type` is what GitHub actually promises, and the suffix is the belt to its braces - the two
 * disagree in a few payloads, and a missed bot is a notification somebody did not want. Matched
 * as a suffix rather than a substring so that a person called `robotnik` stays a person.
 *
 * Deliberately not the whole answer. This is the half that holds for everybody, so it is the
 * half the router can act on before it knows who an event reaches - see isBotFor for the rest.
 */
export function isGithubApp(account: GithubAccount | null | undefined): boolean {
  return account?.type === 'Bot' || /\[bot\]$/i.test(account?.login ?? '');
}

/**
 * The one spelling a login is stored and compared in.
 *
 * Lowercased because GitHub logins differ only in case, the `@` forgiven because a handle is
 * written with one everywhere else, and the `[bot]` dropped because somebody naming a GitHub App
 * types whichever they saw - and `dependabot` and `dependabot[bot]` mean the same machine to
 * anybody who is not GitHub.
 */
export function normalizeAccountLogin(value: string): string {
  return value
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/\[bot\]$/, '');
}

/** Normalised, without blanks or repeats, so the list on screen and the list matched agree. */
export function normalizeAccountList(values: string[]): string[] {
  return [...new Set(values.map(normalizeAccountLogin).filter((login) => login.length > 0))];
}

/** The reader's mode and its lists, which is all of their settings this needs. */
export type BotAccountSettings = Pick<PokeSettings, 'botMode' | 'allowedBots' | 'blockedBots'>;

function isOn(list: string[], account: GithubAccount | null | undefined): boolean {
  const login = normalizeAccountLogin(account?.login ?? '');

  return login.length > 0 && list.includes(login);
}

/** Allowed, which only `none` reads: a person to them, whatever GitHub or the name says. */
function isAllowed(settings: BotAccountSettings, account: GithubAccount | null | undefined) {
  return settings.botMode === 'none' && isOn(settings.allowedBots, account);
}

/** Blocked, which only `all` reads: a bot to them, and one they never want to hear from. */
function isBlocked(settings: BotAccountSettings, account: GithubAccount | null | undefined) {
  return settings.botMode === 'all' && isOn(settings.blockedBots, account);
}

/** Whether this account is a bot to this reader. Absent is a person - see botDropReason. */
export function isBotFor(
  settings: BotAccountSettings,
  account: GithubAccount | null | undefined,
): boolean {
  if (isAllowed(settings, account)) {
    return false;
  }

  if (isBlocked(settings, account)) {
    return true;
  }

  return isGithubApp(account) || /-bot$/.test(normalizeAccountLogin(account?.login ?? ''));
}

type BotRule = 'talking' | 'acting';

/**
 * Which of the two rules each kind falls under. A record rather than two lists, so a kind
 * missing from it is a compile error rather than a kind bots can reach by default.
 */
const BOT_RULES: Record<NotificationType, BotRule> = {
  [NotificationType.ReviewRequested]: 'acting',
  [NotificationType.ReviewSubmitted]: 'acting',
  // A merge queue landing your work is not chatter, and neither is Mergify arming your branch -
  // that is precisely the sort of thing most authors want to hear about, however routine it is.
  [NotificationType.PullRequestMerged]: 'acting',
  [NotificationType.AutoMergeEnabled]: 'acting',
  // The coverage report, every push, forever.
  [NotificationType.PullRequestComment]: 'talking',
  // A bot on an issue is if anything worse than one on a pull request: stale-bots, triage
  // labellers and template-checkers talk to issues that nobody has touched in months.
  [NotificationType.IssueComment]: 'talking',
  [NotificationType.CommentReply]: 'talking',
  // Covers a bot naming a team as well - the same noise multiplied by everyone in it.
  [NotificationType.PullRequestMention]: 'talking',
  [NotificationType.IssueMention]: 'talking',
};

/** The talking. What a bot says is noise; what a bot does to your pull request is not. */
export const BOT_CHATTER_TYPES: NotificationType[] = ALL_NOTIFICATION_TYPES.filter(
  (type) => BOT_RULES[type] === 'talking',
);

/**
 * Who is behind one event: whoever did it, and whose pull request or issue it happened to.
 *
 * Off the payload rather than off the poke, because the poke may already have been reworded -
 * a bot's review request goes out in the author's name - and the question here is who really
 * acted, not whose name reads best.
 */
export interface PokeOrigin {
  actor?: GithubAccount;
  author?: GithubAccount;
}

/**
 * Why this poke is a bot's that this reader does not want, or null where it is not.
 *
 * A review request is a bot's only when nobody human is behind it at all: the asker *and* the
 * author. An assignment bot asking you to look at a colleague's work is that colleague's ask -
 * the message already says so, in their name - while dependabot asking you to look at
 * dependabot's is the thing somebody silencing bots meant. Everything else is the actor's
 * alone: the author of a merged pull request is the person being told, so asking whether they
 * are human would keep every merge.
 *
 * That holds for a blocked assignment bot as much as for any other: the ask it passes on is still
 * the colleague's, in their name, and blocking the bot was about what it does itself.
 *
 * An absent author counts as a person, on the same reasoning as everything else here: a poke
 * nobody can account for is delivered rather than silently lost.
 */
export function botDropReason(
  settings: PokeSettings,
  type: NotificationType,
  origin: PokeOrigin,
): 'bot_chatter' | 'bot_muted' | null {
  if (!isBotFor(settings, origin.actor)) {
    return null;
  }

  if (BOT_RULES[type] === 'talking') {
    return 'bot_chatter';
  }

  if (settings.botMode === 'all' && !isBlocked(settings, origin.actor)) {
    return null;
  }

  if (
    type === NotificationType.ReviewRequested &&
    (origin.author === undefined || !isBotFor(settings, origin.author))
  ) {
    return null;
  }

  return 'bot_muted';
}
