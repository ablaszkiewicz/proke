import { SlackMessage } from '../../slack/app/slack-api.service';
import { GithubNotificationNormalized } from '../core/entities/github-notification.interface';
import { NotificationType } from '../core/entities/notification-type.enum';

/**
 * How much of a comment to relay. Long enough for a paragraph of real context, short enough
 * that a poke stays a poke - the message links to the whole thing, and somebody who wrote three
 * screens about your pull request is asking you to go and read them there.
 */
const MAX_EXCERPT_CHARS = 320;

/**
 * The sentence up to the link, which finishes it. One line, always the same shape:
 * `<who> <did what to> <the thing>`.
 *
 * Issues and pull requests are not distinguished when somebody names you - being mentioned is
 * being mentioned, and the link says which it was.
 */
const LEAD: Record<NotificationType, (actor: string) => string> = {
  [NotificationType.ReviewRequested]: (actor) => `${actor} requested your review on`,
  [NotificationType.ReviewSubmitted]: (actor) => `${actor} reviewed`,
  [NotificationType.PullRequestMerged]: (actor) => `${actor} merged`,
  [NotificationType.PullRequestComment]: (actor) => `${actor} commented on`,
  [NotificationType.PullRequestMention]: (actor) => `${actor} mentioned you on`,
  [NotificationType.IssueMention]: (actor) => `${actor} mentioned you on`,
};

/**
 * A submitted review is the one poke whose news can be good or bad, so it is the one that gets
 * a marker. Everything else stays unadorned - an emoji on every line is decoration, and stops
 * meaning anything.
 */
const REVIEW: Record<string, { icon: string; lead: (actor: string) => string }> = {
  approved: { icon: '✅', lead: (actor) => `${actor} approved` },
  changes_requested: { icon: '❌', lead: (actor) => `${actor} requested changes on` },
};

export function buildPokeMessage(notification: GithubNotificationNormalized): SlackMessage {
  const actor = notification.actorLogin ? `@${notification.actorLogin}` : 'Someone';
  const review =
    notification.type === NotificationType.ReviewSubmitted && notification.reviewState
      ? REVIEW[notification.reviewState]
      : undefined;

  const lead = review ? review.lead(actor) : LEAD[notification.type](actor);
  const icon = review ? `${review.icon} ` : '';
  const label = subject(notification);
  const excerpt = notification.excerpt ? truncate(notification.excerpt) : undefined;

  return {
    // Slack shows this, not the blocks, in the notification banner and the sidebar preview -
    // so it says the whole thing rather than being a "this message has no text" placeholder.
    text: `${icon}${lead} ${label} · ${notification.repositoryFullName}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${icon}${escape(lead)} *${link(notification.htmlUrl, label)}*`,
        },
      },
      // Only when there are words. A review request and a merge have none, and a quote block
      // with nothing in it would read as a message that failed to load.
      ...(excerpt ? [{ type: 'section', text: { type: 'mrkdwn', text: quote(excerpt) } }] : []),
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: escape(notification.repositoryFullName) }],
      },
    ],
  };
}

/** The message the Send a test poke button produces. Deliberately not a fake notification. */
export function buildTestMessage(githubLogin?: string): SlackMessage {
  const who = githubLogin ? `@${githubLogin}` : 'you';

  return {
    text: 'proke is connected — this is where your pokes will arrive.',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*proke is connected.* This is where GitHub pokes for ${escape(who)} will arrive.`,
        },
      },
    ],
  };
}

/**
 * What the link says: the title, then the number people actually use to refer to it. The
 * number alone is unreadable and the title alone is unsearchable.
 */
function subject(notification: GithubNotificationNormalized): string {
  const title = notification.title || 'View on GitHub';

  return notification.number ? `${title} #${notification.number}` : title;
}

/**
 * Slack draws a quote bar beside every line starting with `>`, and consecutive quoted lines
 * share one bar - so the prefix goes on each line, including the blank ones, or a comment with
 * a paragraph break comes out as two separate quotes.
 */
function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? `> ${escape(line)}` : '>'))
    .join('\n');
}

/** Cut on a word boundary where there is one nearby; a mid-word chop looks like a bug. */
function truncate(text: string): string {
  if (text.length <= MAX_EXCERPT_CHARS) {
    return text;
  }

  const cut = text.slice(0, MAX_EXCERPT_CHARS);
  const lastSpace = cut.lastIndexOf(' ');

  return `${(lastSpace > MAX_EXCERPT_CHARS - 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Slack's mrkdwn link. The label is escaped; a `|` or `>` in a title would end the link early. */
function link(url: string, label: string): string {
  if (!url) {
    return escape(label);
  }

  return `<${url}|${escape(label).replace(/\|/g, '❘')}>`;
}

/**
 * Slack treats these three as markup, and pull request titles are user-written text that
 * regularly contains all of them - `<T> & <U>` would otherwise vanish into a broken tag.
 */
function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
