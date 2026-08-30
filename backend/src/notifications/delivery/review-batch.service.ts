import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { getEnvConfig } from '../../shared/configs/env-configs';
import { UserNormalized } from '../../user/core/entities/user.interface';
import {
  GithubNotificationComments,
  GithubNotificationNormalized,
  isReviewVerdict,
} from '../core/entities/github-notification.interface';
import { comparePriority, NotificationType } from '../core/entities/notification-type.enum';
import { NotificationDeliveryService } from './notification-delivery.service';

/**
 * The two things GitHub delivers in pieces.
 *
 * A review is the submission plus one webhook per inline comment. A review request is the team
 * being asked plus, where the team has review assignment switched on, one webhook per member
 * GitHub then asks by name - and a member of the team hears about both.
 */
type BatchKind = 'review' | 'request';

/** The types that are somebody saying something, as opposed to a verdict on the whole review. */
const MENTION_TYPES: NotificationType[] = [
  NotificationType.PullRequestMention,
  NotificationType.IssueMention,
];

interface Batch {
  kind: BatchKind;
  user: UserNormalized;
  /**
   * Bounded by the size of one review for the length of the window, and no longer. A review with
   * hundreds of comments is a few hundred small objects for five seconds.
   */
  notifications: GithubNotificationNormalized[];
  timer: NodeJS.Timeout;
}

/**
 * Holds the pieces of one review, or of one review request, open long enough to send them as
 * one poke.
 *
 * GitHub delivers a review as several webhooks - one per inline comment, plus one for the
 * submission - with no ordering guarantee between them. Routed straight through, approving a
 * pull request with three notes on it costs the author four separate Slack messages, which is
 * precisely the pestering this product exists to stop.
 *
 * A review request asked of a team arrives the same way: the team, and then whichever of its
 * members GitHub picked out to ask by name, a second or so apart. To a person who is both, that
 * is one request told twice, and they should hear it once - as the direct one.
 *
 * The window opens on the first arrival and is never extended, so the wait is bounded no matter
 * how long a reviewer keeps typing: anything later is a second poke rather than an indefinitely
 * deferred first one.
 *
 * Deliberately in this process only, as asked. A second replica has its own map, so a review
 * split across two of them arrives as two pokes - which is exactly today's behaviour, not a
 * failure. Nothing here is authoritative and nothing is lost by a restart, because a batch is
 * flushed on shutdown rather than dropped.
 */
@Injectable()
export class ReviewBatchService implements OnModuleDestroy {
  private readonly logger = new Logger(ReviewBatchService.name);
  private readonly batches = new Map<string, Batch>();
  private readonly windowMs = getEnvConfig().notifications.reviewBatchWindowMs;

  constructor(private readonly deliveryService: NotificationDeliveryService) {}

  /**
   * Takes one routed poke. Returns as soon as it is either sent or held, never once the held
   * one has gone out - the caller is a webhook handler, and GitHub gives up after ten seconds.
   */
  public async submit(
    user: UserNormalized,
    notification: GithubNotificationNormalized,
  ): Promise<void> {
    const piece = pieceOf(notification);

    // Everything that arrives whole: a merge, a conversation comment, a mention. There is
    // nothing for these to be batched with, and holding them would only make them late.
    if (!piece) {
      return this.deliveryService.deliver(user, notification);
    }

    // One per person: two people on the same review are two different messages, and only the
    // recipient decides which of its pieces they were allowed to hear about.
    const key = `${user.id}:${piece.kind}:${piece.id}`;
    const batch = this.batches.get(key);

    // Synchronous from here to the end, and it has to be. Webhooks for one review are handled
    // concurrently, so an await between reading the map and writing it would let two arrivals
    // both find nothing and open two batches.
    if (batch) {
      batch.notifications.push(notification);
      return;
    }

    this.batches.set(key, {
      kind: piece.kind,
      user,
      notifications: [notification],
      timer: setTimeout(() => void this.flush(key), this.windowMs),
    });
  }

  /**
   * Whatever is still waiting goes now, rather than waiting out a window nothing will arrive
   * in. Early is recoverable; never is not.
   */
  public async flushAll(): Promise<void> {
    await Promise.all([...this.batches.keys()].map((key) => this.flush(key)));
  }

  public async onModuleDestroy(): Promise<void> {
    await this.flushAll();
  }

  private async flush(key: string): Promise<void> {
    const batch = this.batches.get(key);

    if (!batch) {
      return;
    }

    this.batches.delete(key);
    clearTimeout(batch.timer);

    try {
      await this.deliveryService.deliver(batch.user, merge(batch));
    } catch (error) {
      // Nothing above this is awaiting: the window closed on a timer, long after the webhook
      // was acknowledged. An error escaping here would be an unhandled rejection.
      this.logger.error(`Failed delivering a batched review to ${batch.user.id}: ${error}`);
    }
  }
}

/**
 * Which batch a poke belongs in, and nothing for the pokes that belong in none.
 *
 * A review is known by its id, which GitHub puts on the submission and on every inline comment
 * alike. A review request has no such id - the team and the person are asked in two unrelated
 * webhooks - so it is known by the pull request it is about, which is the one thing the two
 * share.
 */
function pieceOf(
  notification: GithubNotificationNormalized,
): { kind: BatchKind; id: string } | undefined {
  if (notification.reviewId) {
    return { kind: 'review', id: notification.reviewId };
  }

  if (notification.type === NotificationType.ReviewRequested && notification.number) {
    return { kind: 'request', id: `${notification.repositoryFullName}#${notification.number}` };
  }

  return undefined;
}

function merge(batch: Batch): GithubNotificationNormalized {
  if (batch.notifications.length === 1) {
    return batch.notifications[0];
  }

  return batch.kind === 'review'
    ? mergeReview(batch.notifications)
    : pickRequest(batch.notifications);
}

/**
 * The one request out of several for the same pull request.
 *
 * The direct one, where there is one. "Requested your review" is what the request is to the
 * person reading it; the team's name on the other is a fact about how GitHub got to them, and
 * not one worth a second message. Failing that, the first to arrive - which is the poke they
 * would have got had nothing been held at all.
 */
function pickRequest(notifications: GithubNotificationNormalized[]): GithubNotificationNormalized {
  return notifications.find((notification) => !notification.teamHandle) ?? notifications[0];
}

/**
 * One poke out of everything the review turned out to be.
 *
 * The highest-priority arrival supplies everything factual - which pull request, whose
 * repository, how big the change is - because the pieces only ever differ in what they were
 * about, never in what they were about it. What the batch adds is the count, and the words.
 */
function mergeReview(notifications: GithubNotificationNormalized[]): GithubNotificationNormalized {
  // The submission carries no comment id; every inline note does. Which is the distinction that
  // matters here, and it holds whatever type each of them ended up being.
  const submission = notifications.find((notification) => !notification.commentId);
  const comments = notifications
    .filter((notification) => notification.commentId)
    .sort((a, b) => Number(a.commentId) - Number(b.commentId));

  // An empty review that reached no verdict is the envelope GitHub wraps inline comments in
  // rather than an event of its own. Letting it lead - it outranks a comment - would render
  // three notes on a pull request as the word "reviewed" and nothing else.
  const candidates = isEnvelope(submission) && comments.length > 0 ? comments : notifications;
  // Stable, so comments that tie on priority stay in the order they were written, and the poke
  // links to the first of them rather than to whichever webhook happened to land first.
  const [lead] = [...candidates].sort((a, b) => comparePriority(a.type, b.type));

  return {
    ...lead,
    // The review's own words win where it had any: that is the reviewer on the change as a
    // whole, and it is what GitHub itself shows first. Failing that, the earliest inline note.
    excerpt: submission?.excerpt ?? comments.find((comment) => comment.excerpt)?.excerpt,
    comments: count(comments),
  };
}

/** A review that said nothing and decided nothing. All it holds is the comments. */
function isEnvelope(submission: GithubNotificationNormalized | undefined): boolean {
  return Boolean(submission && !submission.excerpt && !isReviewVerdict(submission.reviewState));
}

/**
 * Absent where there were no inline comments, so that a bare approval renders exactly as it did
 * before there was any of this - a poke about one thing should not know it was ever a batch.
 */
function count(comments: GithubNotificationNormalized[]): GithubNotificationComments | undefined {
  if (comments.length === 0) {
    return undefined;
  }

  return {
    count: comments.length,
    // Every one of them, not any: "mentioned you in 4 comments" when one of the four named you
    // is a more useful sentence than the truth only if you do not mind it being false.
    mentioned: comments.every((comment) => MENTION_TYPES.includes(comment.type)),
  };
}
