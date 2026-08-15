import { Injectable, Logger } from '@nestjs/common';
import { GithubNotificationNormalized } from '../../notifications/core/entities/github-notification.interface';
import {
  comparePriority,
  NotificationType,
} from '../../notifications/core/entities/notification-type.enum';
import { NotificationDeliveryService } from '../../notifications/delivery/notification-delivery.service';
import { isNotificationAllowed } from '../../subscriptions/core/notification-preferences';
import { SubscriptionReadService } from '../../subscriptions/read/subscription-read.service';
import { UserNormalized } from '../../user/core/entities/user.interface';
import { UserReadService } from '../../user/read/user-read.service';
import { extractMentionedLogins } from './github-mentions';

/** Whoever should hear about this. By id where the payload gives one, by handle for mentions. */
interface PokeRecipient {
  githubId?: string;
  githubLogin?: string;
}

interface Poke {
  recipient: PokeRecipient;
  notification: GithubNotificationNormalized;
}

/** The bits of the payload every notification repeats. */
interface EventContext {
  repositoryFullName: string;
  actorLogin: string;
}

/**
 * Turns a webhook payload into at most one poke per person.
 *
 * Routing is by GitHub user id out of the payload, or by handle for @mentions - never via the
 * installation. That only works because users are keyed on githubId; webhooks carry no email
 * at all.
 *
 * One event routinely produces several candidates for the same person: a comment on your own
 * pull request that also @s you is both. Candidates are collected first, filtered against that
 * person's preferences, and only then collapsed to the highest-priority survivor - collapsing
 * earlier would let a muted type swallow the poke a user actually asked for.
 */
@Injectable()
export class GithubWebhookRouterService {
  private readonly logger = new Logger(GithubWebhookRouterService.name);

  constructor(
    private readonly userReadService: UserReadService,
    private readonly subscriptionReadService: SubscriptionReadService,
    private readonly deliveryService: NotificationDeliveryService,
  ) {}

  public async route(event: string, payload: any): Promise<void> {
    const pokes = this.resolve(event, payload);

    if (pokes.length === 0) {
      return;
    }

    const installationId = payload?.installation?.id
      ? String(payload.installation.id)
      : undefined;

    // Every app-delivered event carries its installation. Without one we cannot tell which
    // opt-in would authorise the poke, so we do not send it.
    if (!installationId) {
      this.logger.warn(`Dropping ${event} with no installation id`);
      return;
    }

    const repositoryId =
      payload?.repository?.id === undefined || payload?.repository?.id === null
        ? undefined
        : String(payload.repository.id);
    const senderGithubId = String(payload?.sender?.id ?? '');

    for (const { user, notifications } of (await this.groupByUser(pokes)).values()) {
      // Nobody wants to be told about their own action - including mentioning themselves.
      if (user.githubId && user.githubId === senderGithubId) {
        continue;
      }

      // Installation is somebody else's decision, usually a colleague's. Being poked is
      // this user's, so an install alone is never enough.
      const preferences = await this.subscriptionReadService.readPreferences(
        user.id,
        installationId,
      );

      if (!preferences) {
        continue;
      }

      const wanted = notifications
        .filter((notification) =>
          isNotificationAllowed(preferences, repositoryId, notification.type),
        )
        .sort((a, b) => comparePriority(a.type, b.type));

      if (wanted.length === 0) {
        continue;
      }

      await this.deliveryService.deliver(user, wanted[0]);
    }
  }

  /**
   * Resolves every candidate to a real user and buckets by user id, so that someone reachable
   * both by id and by handle in the same event still ends up as one bucket.
   */
  private async groupByUser(
    pokes: Poke[],
  ): Promise<Map<string, { user: UserNormalized; notifications: GithubNotificationNormalized[] }>> {
    const resolved = new Map<string, UserNormalized | null>();
    const grouped = new Map<
      string,
      { user: UserNormalized; notifications: GithubNotificationNormalized[] }
    >();

    for (const poke of pokes) {
      const key = poke.recipient.githubId
        ? `id:${poke.recipient.githubId}`
        : `login:${poke.recipient.githubLogin?.toLowerCase()}`;

      if (!resolved.has(key)) {
        resolved.set(key, await this.readRecipient(poke.recipient));
      }

      const user = resolved.get(key);

      // Not a PRoke user. Expected - we get events for whole orgs, most of whose members
      // have never signed up.
      if (!user) {
        continue;
      }

      const bucket = grouped.get(user.id);

      if (bucket) {
        bucket.notifications.push(poke.notification);
      } else {
        grouped.set(user.id, { user, notifications: [poke.notification] });
      }
    }

    return grouped;
  }

  private async readRecipient(recipient: PokeRecipient): Promise<UserNormalized | null> {
    if (recipient.githubId) {
      return this.userReadService.readByGithubId(recipient.githubId);
    }

    if (recipient.githubLogin) {
      return this.userReadService.readByGithubLogin(recipient.githubLogin);
    }

    return null;
  }

  private resolve(event: string, payload: any): Poke[] {
    const context: EventContext = {
      repositoryFullName: payload?.repository?.full_name ?? '',
      actorLogin: payload?.sender?.login ?? '',
    };

    switch (event) {
      case 'pull_request':
        return this.resolvePullRequest(payload, context);
      case 'pull_request_review':
        return this.resolvePullRequestReview(payload, context);
      case 'pull_request_review_comment':
        return this.resolvePullRequestReviewComment(payload, context);
      case 'issue_comment':
        return this.resolveIssueComment(payload, context);
      case 'issues':
        return this.resolveIssues(payload, context);
      default:
        return [];
    }
  }

  private resolvePullRequest(payload: any, context: EventContext): Poke[] {
    const pullRequest = payload?.pull_request;

    if (!pullRequest) {
      return [];
    }

    if (payload.action === 'review_requested' && payload.requested_reviewer) {
      return [
        {
          recipient: { githubId: String(payload.requested_reviewer.id) },
          notification: this.build(
            NotificationType.ReviewRequested,
            pullRequest.title,
            pullRequest.html_url,
            context,
          ),
        },
      ];
    }

    // `closed` fires for abandoned pull requests too; only a merge is worth a poke.
    if (payload.action === 'closed' && pullRequest.merged && pullRequest.user) {
      return [
        {
          recipient: { githubId: String(pullRequest.user.id) },
          notification: this.build(
            NotificationType.PullRequestMerged,
            pullRequest.title,
            pullRequest.html_url,
            context,
          ),
        },
      ];
    }

    // Only on open. `edited` fires on every description tweak and would re-poke everyone
    // already named in it.
    if (payload.action === 'opened') {
      return this.mentionPokes(
        pullRequest.body,
        NotificationType.PullRequestMention,
        pullRequest.title,
        pullRequest.html_url,
        context,
      );
    }

    return [];
  }

  private resolvePullRequestReview(payload: any, context: EventContext): Poke[] {
    const pullRequest = payload?.pull_request;

    if (payload?.action !== 'submitted' || !pullRequest) {
      return [];
    }

    const htmlUrl = payload.review?.html_url ?? pullRequest.html_url;
    const pokes: Poke[] = [];

    if (pullRequest.user) {
      pokes.push({
        recipient: { githubId: String(pullRequest.user.id) },
        notification: this.build(
          NotificationType.ReviewSubmitted,
          pullRequest.title,
          htmlUrl,
          context,
        ),
      });
    }

    pokes.push(
      ...this.mentionPokes(
        payload.review?.body,
        NotificationType.PullRequestMention,
        pullRequest.title,
        htmlUrl,
        context,
      ),
    );

    return pokes;
  }

  private resolvePullRequestReviewComment(payload: any, context: EventContext): Poke[] {
    const pullRequest = payload?.pull_request;

    if (payload?.action !== 'created' || !pullRequest) {
      return [];
    }

    const htmlUrl = payload.comment?.html_url ?? pullRequest.html_url;
    const pokes: Poke[] = [];

    if (pullRequest.user) {
      pokes.push({
        recipient: { githubId: String(pullRequest.user.id) },
        notification: this.build(
          NotificationType.PullRequestComment,
          pullRequest.title,
          htmlUrl,
          context,
        ),
      });
    }

    pokes.push(
      ...this.mentionPokes(
        payload.comment?.body,
        NotificationType.PullRequestMention,
        pullRequest.title,
        htmlUrl,
        context,
      ),
    );

    return pokes;
  }

  private resolveIssueComment(payload: any, context: EventContext): Poke[] {
    const issue = payload?.issue;

    if (payload?.action !== 'created' || !issue) {
      return [];
    }

    // GitHub sends conversation comments on pull requests as `issue_comment`; the only thing
    // separating the two is this field.
    const isPullRequest = Boolean(issue.pull_request);
    const htmlUrl = payload.comment?.html_url ?? issue.html_url;
    const pokes: Poke[] = [];

    // A comment on an issue you opened is not a poke on its own - only a mention in it is.
    if (isPullRequest && issue.user) {
      pokes.push({
        recipient: { githubId: String(issue.user.id) },
        notification: this.build(
          NotificationType.PullRequestComment,
          issue.title,
          htmlUrl,
          context,
        ),
      });
    }

    pokes.push(
      ...this.mentionPokes(
        payload.comment?.body,
        isPullRequest ? NotificationType.PullRequestMention : NotificationType.IssueMention,
        issue.title,
        htmlUrl,
        context,
      ),
    );

    return pokes;
  }

  private resolveIssues(payload: any, context: EventContext): Poke[] {
    const issue = payload?.issue;

    if (payload?.action !== 'opened' || !issue) {
      return [];
    }

    return this.mentionPokes(
      issue.body,
      NotificationType.IssueMention,
      issue.title,
      issue.html_url,
      context,
    );
  }

  private mentionPokes(
    body: string | undefined,
    type: NotificationType,
    title: string | undefined,
    htmlUrl: string | undefined,
    context: EventContext,
  ): Poke[] {
    return extractMentionedLogins(body).map((githubLogin) => ({
      recipient: { githubLogin },
      notification: this.build(type, title, htmlUrl, context),
    }));
  }

  private build(
    type: NotificationType,
    title: string | undefined,
    htmlUrl: string | undefined,
    context: EventContext,
  ): GithubNotificationNormalized {
    return {
      type,
      title: title ?? '',
      htmlUrl: htmlUrl ?? '',
      repositoryFullName: context.repositoryFullName,
      actorLogin: context.actorLogin,
    };
  }
}
