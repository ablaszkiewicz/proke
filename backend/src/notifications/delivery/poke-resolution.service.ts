import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsService } from '../../analytics/analytics.service';
import { SlackApiError, SlackApiService } from '../../slack/app/slack-api.service';
import { SlackWorkspaceReadService } from '../../slack/workspaces/read/slack-workspace-read.service';
import {
  PokeResolution,
  PokeResolutionKind,
  PokeReviewer,
} from '../core/entities/github-notification.interface';
import {
  PokeMessageNormalized,
  PokeMessageReviewer,
} from '../messages/core/entities/poke-message.interface';
import { PokeMessageReadService } from '../messages/read/poke-message-read.service';
import { PokeMessageWriteService } from '../messages/write/poke-message-write.service';
import { buildPokeMessage } from './slack-message';

/**
 * What happened to the pull request, before we know who it happened to.
 *
 * The actor is by id as well as by handle for the same reason routing is: only the id survives
 * a rename, and the one thing this decides per recipient is whether the actor is them.
 */
export interface PokeResolutionEvent {
  kind: PokeResolutionKind;
  actorGithubId?: string;
  actorLogin?: string;
}

/**
 * Somebody reviewed the pull request and decided nothing. The request stands; the message
 * gains their name.
 */
export interface PokeReviewerEvent {
  actorGithubId?: string;
  actorLogin?: string;
}

/** Slack saying the message is not there to edit. The row is pointing at nothing. */
const GONE = ['message_not_found', 'channel_not_found'];

/**
 * Goes back and edits review requests the pull request has moved on from - struck through
 * where it has moved past them, annotated where somebody has merely been there first.
 *
 * The asymmetry with delivery is the point: a poke is sent to one person because something
 * concerned them, but a review is about the pull request, so one review can edit four
 * messages in four different DMs - none of them the reviewer's own.
 *
 * Every failure here is quiet. Nothing is waiting on this, the original poke went out fine, and
 * an edit that did not happen leaves the reader exactly where they were before the feature
 * existed. Rows that could not be edited are dropped or left to expire rather than retried,
 * because the news gets staler than it is worth.
 */
@Injectable()
export class PokeResolutionService {
  private readonly logger = new Logger(PokeResolutionService.name);

  constructor(
    private readonly messageReadService: PokeMessageReadService,
    private readonly messageWriteService: PokeMessageWriteService,
    private readonly workspaceReadService: SlackWorkspaceReadService,
    private readonly slackApiService: SlackApiService,
    private readonly analytics: AnalyticsService,
  ) {}

  public async resolve(
    repositoryFullName: string,
    pullRequestNumber: number,
    event: PokeResolutionEvent,
  ): Promise<void> {
    try {
      const messages = await this.messageReadService.readForPullRequest(
        repositoryFullName,
        pullRequestNumber,
      );

      // The common case by a distance: most pull requests never had a review request poke to
      // strike, and every merge in every subscribed repository comes through here.
      if (messages.length === 0) {
        return;
      }

      // Concurrently, and one failure must not take the others with it - these are unrelated
      // people in possibly unrelated workspaces who happen to share a pull request.
      await Promise.all(messages.map((message) => this.settle(message, event)));
    } catch (error) {
      this.logger.error(
        `Could not resolve pokes for ${repositoryFullName}#${pullRequestNumber}: ${error}`,
      );
    }
  }

  /**
   * Names a reviewer under every request still outstanding on the pull request, without
   * settling any of them.
   *
   * Same shape as resolve, same quietness, and the same fan-out - but the rows stay, because the
   * one thing this must not do is stop the strikethrough from landing when a verdict does.
   */
  public async annotate(
    repositoryFullName: string,
    pullRequestNumber: number,
    event: PokeReviewerEvent,
  ): Promise<void> {
    try {
      const messages = await this.messageReadService.readForPullRequest(
        repositoryFullName,
        pullRequestNumber,
      );

      if (messages.length === 0) {
        return;
      }

      await Promise.all(messages.map((message) => this.name(message, event)));
    } catch (error) {
      this.logger.error(
        `Could not annotate pokes for ${repositoryFullName}#${pullRequestNumber}: ${error}`,
      );
    }
  }

  private async settle(message: PokeMessageNormalized, event: PokeResolutionEvent): Promise<void> {
    const resolution: PokeResolution = {
      kind: event.kind,
      actorLogin: event.actorLogin,
      bySelf: Boolean(event.actorGithubId) && message.userGithubId === event.actorGithubId,
    };

    const workspace = await this.workspaceReadService.readLiveWithToken(message.teamId);

    // Uninstalled or revoked since the poke went out. Nothing will ever edit this message, so
    // the row is waiting for a day that cannot come.
    if (!workspace) {
      await this.messageWriteService.delete(message.id);
      return;
    }

    try {
      await this.slackApiService.updateMessage(
        workspace.botToken,
        message.channelId,
        message.messageTs,
        buildPokeMessage(message.notification, { resolution }),
      );

      // Before the row goes, and only once Slack has confirmed the edit - a poke counted as
      // resolved that still reads as outstanding would be the one number here worth having.
      this.analytics.capture(message.userId, 'poke_resolved', {
        resolution: resolution.kind,
        by_self: resolution.bySelf,
        repository: message.repositoryFullName,
        repository_owner: message.repositoryFullName.split('/')[0],
        actor_login: resolution.actorLogin,
      });

      await this.messageWriteService.delete(message.id);
    } catch (error) {
      await this.handleFailure(message, error);
    }
  }

  private async name(message: PokeMessageNormalized, event: PokeReviewerEvent): Promise<void> {
    const reviewer: PokeMessageReviewer = {
      githubId: event.actorGithubId,
      login: event.actorLogin,
    };

    // The reader's own comments are not news to the reader. Left off rather than rendered as
    // "you", unlike a verdict, because a verdict changes what the message is and this would
    // only change what it costs.
    if (Boolean(event.actorGithubId) && message.userGithubId === event.actorGithubId) {
      return;
    }

    // Already on the line. A second review from the same person with no more of a verdict than
    // the first says nothing the message does not, and an edit that changes nothing is a Slack
    // call for nothing.
    if (message.reviewers.some((known) => samePerson(known, reviewer))) {
      return;
    }

    const workspace = await this.workspaceReadService.readLiveWithToken(message.teamId);

    if (!workspace) {
      await this.messageWriteService.delete(message.id);
      return;
    }

    // The row before the message, which is the other way round from settle - and on purpose.
    // The row is what every later edit renders from, so a row that knows about a reviewer the
    // message does not yet is healed by the next edit, whereas a message that knows about one
    // the row does not would lose them the next time anybody else reviewed.
    await this.messageWriteService.addReviewer(message.id, reviewer);

    const reviewers: PokeReviewer[] = [...message.reviewers, reviewer].map((known) => ({
      login: known.login,
    }));

    try {
      await this.slackApiService.updateMessage(
        workspace.botToken,
        message.channelId,
        message.messageTs,
        buildPokeMessage(message.notification, { reviewers }),
      );

      this.analytics.capture(message.userId, 'poke_annotated', {
        repository: message.repositoryFullName,
        repository_owner: message.repositoryFullName.split('/')[0],
        actor_login: event.actorLogin,
        reviewer_count: reviewers.length,
      });
    } catch (error) {
      await this.handleFailure(message, error);
    }
  }

  private async handleFailure(message: PokeMessageNormalized, error: unknown): Promise<void> {
    if (error instanceof SlackApiError && GONE.includes(error.code)) {
      this.logger.debug(
        `Poke ${message.messageTs} is gone from ${message.channelId}; dropping the row`,
      );
      await this.messageWriteService.delete(message.id);

      return;
    }

    // Left in place deliberately. A rate limit or a blip is the one case where the row is still
    // good, and the next thing to happen to this pull request will try again - until the TTL
    // decides the edit stopped being worth applying.
    this.logger.warn(`Could not edit the poke sent to ${message.userId}: ${error}`);
  }
}

/**
 * Whether two reviewers are one person. By id where both have one, which survives a rename;
 * by handle where GitHub gave us nothing better.
 */
function samePerson(a: PokeMessageReviewer, b: PokeMessageReviewer): boolean {
  if (a.githubId && b.githubId) {
    return a.githubId === b.githubId;
  }

  return Boolean(a.login) && a.login === b.login;
}
