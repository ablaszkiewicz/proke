import { SlackMessage } from '../../slack/app/slack-api.service';
import {
  GithubDiffStat,
  GithubNotificationNormalized,
} from '../core/entities/github-notification.interface';
import { NotificationType } from '../core/entities/notification-type.enum';

/**
 * How much of a comment to relay. Long enough for a paragraph of real context, short enough
 * that a poke stays a poke - the message links to the whole thing, and somebody who wrote three
 * screens about your pull request is asking you to go and read them there.
 */
const MAX_EXCERPT_CHARS = 320;

/**
 * Where a repository owner's avatar may come from.
 *
 * Slack fetches every `image_url` itself when the message is posted and rejects the whole
 * message if it cannot - so an unexpected host is not a broken picture, it is a poke that never
 * arrives. Only the two GitHub serves avatars from are worth that risk.
 */
const AVATAR_HOSTS = ['avatars.githubusercontent.com', 'github.com'];

/** Slack draws context images at about 20px; twice that keeps it sharp without being a download. */
const AVATAR_SIZE = 48;

/**
 * The sentence up to the link, which finishes it. One line, always the same shape:
 * `<who> <did what to> <the thing>`.
 *
 * Issues and pull requests are not distinguished when somebody names you - being mentioned is
 * being mentioned, and the link says which it was.
 */
const LEAD: Record<
  NotificationType,
  (actor: string, notification: GithubNotificationNormalized) => string
> = {
  [NotificationType.ReviewRequested]: (actor) => `${actor} requested your review on`,
  [NotificationType.ReviewSubmitted]: (actor) => `${actor} reviewed`,
  [NotificationType.PullRequestMerged]: (actor) => `${actor} merged`,
  [NotificationType.PullRequestComment]: (actor) => `${actor} commented on`,
  [NotificationType.PullRequestMention]: (actor) => `${actor} mentioned you on`,
  [NotificationType.IssueMention]: (actor) => `${actor} mentioned you on`,
  // Says the team: "mentioned you" would be a small lie, and why you got this is the one thing
  // you want from an unexpected poke.
  [NotificationType.TeamMention]: (actor, notification) =>
    notification.teamHandle
      ? `${actor} mentioned @${notification.teamHandle} on`
      : `${actor} mentioned your team on`,
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

  const lead = review ? review.lead(actor) : LEAD[notification.type](actor, notification);
  const icon = review ? `${review.icon} ` : '';
  const label = subject(notification);
  const excerpt = notification.excerpt ? truncate(notification.excerpt) : undefined;
  const avatar = avatarUrl(notification.ownerAvatarUrl);
  const diff = notification.diff ? diffLabel(notification.diff) : undefined;

  return {
    // Slack shows this, not the blocks, in the notification banner and the sidebar preview -
    // so it says the whole thing rather than being a "this message has no text" placeholder.
    // The size rides along: deciding whether to open a review request now or later is mostly a
    // question of how big it is, and the banner is where that decision gets made.
    text:
      `${icon}${lead} ${label} · ${notification.repositoryFullName}` + (diff ? ` (${diff})` : ''),
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
        elements: [
          // The org's logo, read before the name beside it is. Left out rather than substituted
          // when there is none - a placeholder avatar says something false about who owns this.
          ...(avatar ? [{ type: 'image', image_url: avatar, alt_text: owner(notification) }] : []),
          { type: 'mrkdwn', text: escape(notification.repositoryFullName) },
          // Its own element, so Slack sets it apart from the name rather than running the two
          // together, and in backticks, which is what makes Slack colour it.
          ...(diff ? [{ type: 'mrkdwn', text: `\`${diff}\`` }] : []),
        ],
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

/** Whoever owns the repository. The alt text for their avatar, and nothing else. */
function owner(notification: GithubNotificationNormalized): string {
  return notification.repositoryFullName.split('/')[0] || notification.repositoryFullName;
}

/**
 * The avatar Slack is allowed to go and fetch, sized down on the way.
 *
 * Anything unparseable, insecure or off GitHub is dropped rather than passed through: Slack
 * validates image URLs when the message is posted, and a rejected block would cost the whole
 * poke to gain a picture.
 */
function avatarUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'https:' || !AVATAR_HOSTS.includes(parsed.hostname)) {
      return undefined;
    }

    // GitHub serves whatever size is asked for, and the full-resolution original is several
    // hundred kilobytes to render at twenty pixels.
    parsed.searchParams.set('s', String(AVATAR_SIZE));

    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * `+163/-23`. How big the change is, in the shape everybody already reads it in.
 *
 * Grouped at the thousands because the difference between a four and a five digit diff is the
 * whole message at that size, and unseparated digits make it a thing to count rather than read.
 */
function diffLabel(diff: GithubDiffStat): string {
  return `+${group(diff.additions)}/-${group(diff.deletions)}`;
}

function group(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
