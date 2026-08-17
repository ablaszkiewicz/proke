import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { AnalyticsService } from '../../analytics/analytics.service';
import { Public } from '../../auth/core/decorators/is-public';
import { SlackSignatureService } from '../../slack/app/slack-signature.service';
import { SlackLinkWriteService } from '../../slack/links/write/slack-link-write.service';
import { SlackWorkspaceWriteService } from '../../slack/workspaces/write/slack-workspace-write.service';

/**
 * The only Slack events proke cares about, and they are both the same news: this workspace
 * cannot be posted to any more.
 *
 * Without them a revoked token is only discovered the next time somebody happens to be poked
 * there, and the dashboard goes on claiming everything is connected in the meantime.
 */
@Public()
@ApiExcludeController()
@Controller('webhooks/slack')
export class SlackEventsController {
  private readonly logger = new Logger(SlackEventsController.name);

  constructor(
    private readonly signatureService: SlackSignatureService,
    private readonly workspaceWriteService: SlackWorkspaceWriteService,
    private readonly linkWriteService: SlackLinkWriteService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Post('events')
  @HttpCode(200)
  public async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-slack-request-timestamp') timestamp: string,
    @Headers('x-slack-signature') signature: string,
  ): Promise<{ challenge?: string; ok: boolean }> {
    if (!this.signatureService.verify(request.rawBody, timestamp, signature)) {
      throw new UnauthorizedException('Invalid Slack signature');
    }

    const payload: any = request.body;

    // How Slack checks the endpoint is ours when the URL is first saved. Signed like any other
    // event, so it is verified above rather than let through as a special case.
    if (payload?.type === 'url_verification') {
      return { ok: true, challenge: payload.challenge };
    }

    // Slack retries anything it does not hear back from within three seconds, so acknowledge
    // first and do the work detached - same bargain as the GitHub webhook.
    void this.handle(payload).catch((error) => {
      this.logger.error(`Failed handling Slack event: ${error}`);
    });

    return { ok: true };
  }

  private async handle(payload: any): Promise<void> {
    const type = payload?.event?.type;
    const teamId = payload?.team_id;

    if (!teamId || (type !== 'app_uninstalled' && type !== 'tokens_revoked')) {
      return;
    }

    this.logger.warn(`Slack workspace ${teamId} sent ${type}; dropping its links`);

    // Keyed on the workspace, not a person, and deliberately without one: this is one event
    // about a workspace that has gone away, not an event about each of the people in it. The
    // users are still proke users - they have simply lost their destination - and writing a
    // person profile off a Slack team id would invent a person who does not exist.
    this.analytics.captureWithoutPerson(`slack_team:${teamId}`, 'slack_workspace_revoked', {
      team_id: teamId,
      reason: type,
    });

    // The workspace row survives, marked revoked, so the dashboard can say "add proke back"
    // rather than silently forgetting. The links do not: a Slack user id only ever meant
    // something relative to a workspace we can reach.
    await this.workspaceWriteService.markRevoked(teamId);
    await this.linkWriteService.deleteForTeam(teamId);
  }
}
