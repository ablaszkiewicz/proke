import { Injectable, Logger } from '@nestjs/common';
import {
  GithubTeamMember,
  GithubTeamMembersDataService,
} from '../../github-app/github-team-members-data.service';
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
import { GithubRepositoryAccessDataService } from './github-repository-access-data.service';
import { extractMentions, MentionedTeam } from './github-mentions';

/**
 * Whoever should hear about this. By id where the payload gives one, by handle for mentions, and
 * by team where a group was named - which is a question for GitHub rather than a person yet.
 */
interface PokeRecipient {
  githubId?: string;
  githubLogin?: string;
  team?: MentionedTeam;
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
 * The thing being talked about, and what was said about it.
 *
 * One object rather than a growing list of positional arguments, because every resolver reads
 * the same handful of fields off whichever of `issue` or `pull_request` the event carries.
 */
interface PokeSubject {
  title?: string;
  htmlUrl?: string;
  /** The #number. How people actually refer to a pull request or an issue. */
  number?: number;
  body?: string;
  /** `approved`, `changes_requested`, `commented` - only ever set on a submitted review. */
  reviewState?: string;
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
    private readonly teamMembersDataService: GithubTeamMembersDataService,
    private readonly repositoryAccessDataService: GithubRepositoryAccessDataService,
  ) {}

  public async route(event: string, payload: any): Promise<void> {
    const candidates = this.suppressBotChatter(this.resolve(event, payload), payload?.sender);

    if (candidates.length === 0) {
      return;
    }

    const installationId = payload?.installation?.id ? String(payload.installation.id) : undefined;

    // Every app-delivered event carries its installation. Without one we cannot tell which
    // opt-in would authorise the poke, so we do not send it.
    if (!installationId) {
      this.logger.warn(`Dropping ${event} with no installation id`);
      return;
    }

    // After suppression so a bot naming a team costs no API call, and before grouping so a team
    // is just several more candidates by the time preferences are consulted.
    const pokes = await this.expandTeamMentions(
      candidates,
      installationId,
      payload?.organization?.login,
    );

    if (pokes.length === 0) {
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

      // Last, and after preferences on purpose: this is the only gate that costs a GitHub call,
      // so it is not worth paying for somebody who muted this kind of poke anyway.
      if (!(await this.maySeeRepository(user, payload?.repository))) {
        continue;
      }

      await this.deliveryService.deliver(user, wanted[0]);
    }
  }

  /**
   * Whether this person is allowed to know the event happened at all.
   *
   * Everything above this line reasons about the *installation*: which one the event came from,
   * and whether this user opted into it. None of that is repository access. An org-wide install
   * covers repositories a given member cannot open, and an @mention is only prose - anybody can
   * type anybody's handle into an issue in a private repository, and a team mention reaches
   * every member of a team whether or not that team can see where it was written.
   *
   * Without this the poke relays the repository name, the title and a quote of the comment to
   * somebody GitHub itself would not have notified.
   *
   * Public repositories skip the call: there is nothing to leak, and it is the common case.
   */
  private async maySeeRepository(user: UserNormalized, repository: any): Promise<boolean> {
    if (repository?.private === false) {
      return true;
    }

    const repositoryFullName = repository?.full_name;

    // Nothing to ask about. Every event we route carries a repository, so this is a malformed
    // payload rather than a kind of event, and a poke naming no repository is no loss.
    if (!repositoryFullName) {
      this.logger.warn('Dropping a poke for an event carrying no repository');
      return false;
    }

    const access = await this.repositoryAccessDataService.canAccess(user, repositoryFullName);

    if (access === null) {
      // A revoked token, a rate limit, GitHub being down. Failing open here is the whole leak
      // this check exists to close, so a question we could not ask is a no.
      this.logger.warn(
        `Dropping a poke for ${user.githubLogin ?? user.id}: could not confirm access to ` +
          repositoryFullName,
      );
      return false;
    }

    return access;
  }

  /**
   * Drops the kinds of poke a bot has no business sending.
   *
   * CI bots, coverage bots and dependency bots comment constantly, and a machine writing your
   * @handle is not a colleague asking you something - it is the single largest source of noise
   * in a GitHub notification inbox, and the reason people stop reading them.
   *
   * Deliberately narrow. A bot can still reach you when the event is about *your* work rather
   * than its own chatter: a merge queue landing your pull request, or an automation asking you
   * to review one, are real and still arrive. Only the talking is suppressed.
   *
   * Applied before preferences and before collapsing, so a bot comment that also mentions you
   * cannot survive as the lower-priority half of the pair.
   */
  private suppressBotChatter(pokes: Poke[], sender: any): Poke[] {
    if (!isBot(sender)) {
      return pokes;
    }

    const kept = pokes.filter((poke) => !BOT_SUPPRESSED_TYPES.includes(poke.notification.type));

    if (kept.length < pokes.length) {
      this.logger.debug(
        `Suppressed ${pokes.length - kept.length} poke(s) from bot ${sender?.login}`,
      );
    }

    return kept;
  }

  /**
   * Turns `@org/team` into the people in it - one candidate each, all carrying the notification
   * built from the sentence that named them. A team we cannot resolve pokes nobody, deliberately:
   * the alternative is guessing at who was meant.
   */
  private async expandTeamMentions(
    pokes: Poke[],
    installationId: string,
    organizationLogin: string | undefined,
  ): Promise<Poke[]> {
    if (!pokes.some((poke) => poke.recipient.team)) {
      return pokes;
    }

    const expanded: Poke[] = [];

    for (const poke of pokes) {
      const team = poke.recipient.team;

      if (!team) {
        expanded.push(poke);
        continue;
      }

      const members = await this.readTeamMembers(team, installationId, organizationLogin);

      for (const member of members) {
        expanded.push({
          recipient: { githubId: member.githubId },
          notification: poke.notification,
        });
      }
    }

    return expanded;
  }

  private async readTeamMembers(
    team: MentionedTeam,
    installationId: string,
    organizationLogin: string | undefined,
  ): Promise<GithubTeamMember[]> {
    // The event's own org is the only one we hold a token for. `@someone-else/team` is prose,
    // and a repository owned by a person has no teams at all.
    if (!organizationLogin || team.org.toLowerCase() !== organizationLogin.toLowerCase()) {
      return [];
    }

    try {
      return (
        (await this.teamMembersDataService.listMembers(installationId, team.org, team.slug)) ?? []
      );
    } catch (error) {
      // One unreachable team must not cost the other people this event was going to poke.
      this.logger.warn(`Could not expand @${team.handle}: ${error}`);
      return [];
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

  /**
   * By id whenever the payload carries one, and only then by handle.
   *
   * The order is the point. A GitHub id is permanent and never reused; a handle is released the
   * instant its owner renames, and somebody else can hold it minutes later. Every event that
   * names a person structurally - a review request, a merge, the author of a pull request -
   * carries the id, so the handle path is reached only for @mentions, which are parsed out of
   * prose and have nothing else to go on. UserWriteService keeps that path honest by releasing
   * a handle from any stale row the moment its new owner signs in.
   */
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

    const subject: PokeSubject = {
      title: pullRequest.title,
      htmlUrl: pullRequest.html_url,
      number: pullRequest.number,
    };

    if (payload.action === 'review_requested' && payload.requested_reviewer) {
      return [
        {
          recipient: { githubId: String(payload.requested_reviewer.id) },
          notification: this.build(NotificationType.ReviewRequested, subject, context),
        },
      ];
    }

    // `closed` fires for abandoned pull requests too; only a merge is worth a poke.
    if (payload.action === 'closed' && pullRequest.merged && pullRequest.user) {
      return [
        {
          recipient: { githubId: String(pullRequest.user.id) },
          notification: this.build(NotificationType.PullRequestMerged, subject, context),
        },
      ];
    }

    // Only on open. `edited` fires on every description tweak and would re-poke everyone
    // already named in it.
    if (payload.action === 'opened') {
      return this.mentionPokes(
        NotificationType.PullRequestMention,
        { ...subject, body: pullRequest.body },
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

    const subject: PokeSubject = {
      title: pullRequest.title,
      htmlUrl: payload.review?.html_url ?? pullRequest.html_url,
      number: pullRequest.number,
      // Empty on a bare approval, which is right: there is nothing to quote.
      body: payload.review?.body,
      // Approving and demanding changes are opposite news and read as such; the type alone
      // cannot say which happened.
      reviewState: payload.review?.state,
    };

    const pokes: Poke[] = [];

    if (pullRequest.user) {
      pokes.push({
        recipient: { githubId: String(pullRequest.user.id) },
        notification: this.build(NotificationType.ReviewSubmitted, subject, context),
      });
    }

    pokes.push(...this.mentionPokes(NotificationType.PullRequestMention, subject, context));

    return pokes;
  }

  private resolvePullRequestReviewComment(payload: any, context: EventContext): Poke[] {
    const pullRequest = payload?.pull_request;

    if (payload?.action !== 'created' || !pullRequest) {
      return [];
    }

    const subject: PokeSubject = {
      title: pullRequest.title,
      htmlUrl: payload.comment?.html_url ?? pullRequest.html_url,
      number: pullRequest.number,
      body: payload.comment?.body,
    };

    const pokes: Poke[] = [];

    if (pullRequest.user) {
      pokes.push({
        recipient: { githubId: String(pullRequest.user.id) },
        notification: this.build(NotificationType.PullRequestComment, subject, context),
      });
    }

    pokes.push(...this.mentionPokes(NotificationType.PullRequestMention, subject, context));

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
    const subject: PokeSubject = {
      title: issue.title,
      htmlUrl: payload.comment?.html_url ?? issue.html_url,
      number: issue.number,
      body: payload.comment?.body,
    };

    const pokes: Poke[] = [];

    // A comment on an issue you opened is not a poke on its own - only a mention in it is.
    if (isPullRequest && issue.user) {
      pokes.push({
        recipient: { githubId: String(issue.user.id) },
        notification: this.build(NotificationType.PullRequestComment, subject, context),
      });
    }

    pokes.push(
      ...this.mentionPokes(
        isPullRequest ? NotificationType.PullRequestMention : NotificationType.IssueMention,
        subject,
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
      NotificationType.IssueMention,
      {
        title: issue.title,
        htmlUrl: issue.html_url,
        number: issue.number,
        body: issue.body,
      },
      context,
    );
  }

  /** `type` is the personal mention only; a team mention is one type either way. */
  private mentionPokes(
    type: NotificationType,
    subject: PokeSubject,
    context: EventContext,
  ): Poke[] {
    // The text that mentions somebody is the whole reason they are being poked, so it travels
    // with the poke rather than being thrown away after the @handles are pulled out of it.
    const { logins, teams } = extractMentions(subject.body);

    return [
      ...logins.map((githubLogin) => ({
        recipient: { githubLogin },
        notification: this.build(type, subject, context),
      })),
      ...teams.map((team) => ({
        recipient: { team },
        notification: this.build(NotificationType.TeamMention, subject, context, team.handle),
      })),
    ];
  }

  private build(
    type: NotificationType,
    subject: PokeSubject,
    context: EventContext,
    teamHandle?: string,
  ): GithubNotificationNormalized {
    return {
      type,
      title: subject.title ?? '',
      htmlUrl: subject.htmlUrl ?? '',
      number: subject.number,
      repositoryFullName: context.repositoryFullName,
      actorLogin: context.actorLogin,
      excerpt: normalizeBody(subject.body),
      reviewState: subject.reviewState?.toLowerCase(),
      teamHandle,
    };
  }
}

/**
 * The talking. What a bot says is noise; what a bot *does* to your pull request is not, so
 * review requests, submitted reviews and merges are missing from this list on purpose.
 */
const BOT_SUPPRESSED_TYPES: NotificationType[] = [
  NotificationType.PullRequestComment,
  NotificationType.PullRequestMention,
  NotificationType.IssueMention,
  // A bot naming a team is the same noise multiplied by everyone in it.
  NotificationType.TeamMention,
];

/**
 * Whether an actor is a machine.
 *
 * `type` is what GitHub actually promises, and the suffix is the belt to its braces - the two
 * disagree in a few payloads, and a missed bot is a notification somebody did not want. Matched
 * as a suffix rather than a substring so that a person called `robotnik` stays a person.
 */
function isBot(sender: any): boolean {
  return sender?.type === 'Bot' || /\[bot\]$/i.test(sender?.login ?? '');
}

/**
 * What somebody wrote, minus what they did not.
 *
 * Pull request and issue templates are mostly HTML comments, and a description that is nothing
 * but an unfilled template should read as no message at all rather than as a wall of
 * instructions the author never saw.
 */
function normalizeBody(body: string | undefined): string | undefined {
  if (!body) {
    return undefined;
  }

  const cleaned = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r\n/g, '\n')
    // Blank-line runs are load-bearing in markdown but not worth relaying.
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned.length > 0 ? cleaned : undefined;
}
