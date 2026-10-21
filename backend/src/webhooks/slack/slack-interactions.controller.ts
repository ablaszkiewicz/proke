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
import { Public } from '../../auth/core/decorators/is-public';
import { LISTEN_REMINDER_STOP_ACTION } from '../../notifications/delivery/slack-message';
import { ListenReminderService } from '../../notifications/listen-reminder/listen-reminder.service';
import { SlackSignatureService } from '../../slack/app/slack-signature.service';

/**
 * Where Slack sends button presses - the app's Interactivity Request URL.
 *
 * One button does anything here: "Never remind me again" on the listen reminder. Every other
 * button proke sends is a link, which Slack still reports here once interactivity is on, and
 * which is acknowledged and otherwise ignored - the browser has already opened it.
 */
@Public()
@ApiExcludeController()
@Controller('webhooks/slack')
export class SlackInteractionsController {
  private readonly logger = new Logger(SlackInteractionsController.name);

  constructor(
    private readonly signatureService: SlackSignatureService,
    private readonly listenReminderService: ListenReminderService,
  ) {}

  @Post('interactions')
  @HttpCode(200)
  public receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-slack-request-timestamp') timestamp: string,
    @Headers('x-slack-signature') signature: string,
  ): void {
    // Signed over the form-encoded bytes as they arrived, which main.ts keeps for this parser too.
    if (!this.signatureService.verify(request.rawBody, timestamp, signature)) {
      throw new UnauthorizedException('Invalid Slack signature');
    }

    const payload = parsePayload(request.body?.payload);

    // Acknowledged first and handled detached, as the events are: Slack shows the person an
    // error on anything it does not hear back from within three seconds.
    void this.handle(payload).catch((error) => {
      this.logger.error(`Failed handling a Slack interaction: ${error}`);
    });
  }

  private async handle(payload: any): Promise<void> {
    if (payload?.type !== 'block_actions' || !Array.isArray(payload.actions)) {
      return;
    }

    const action = payload.actions.find(
      (candidate: any) => candidate?.action_id === LISTEN_REMINDER_STOP_ACTION,
    );

    // The user id rides on the button rather than being looked up from who pressed it. Slack
    // signs the payload and builds it from the message proke posted, so the value is our own -
    // and it is exact where one Slack person is linked to two proke accounts.
    if (typeof action?.value !== 'string') {
      return;
    }

    await this.listenReminderService.stop({
      userId: action.value,
      teamId: payload.team?.id ?? payload.user?.team_id,
      channelId: payload.container?.channel_id ?? payload.channel?.id,
      messageTs: payload.container?.message_ts ?? payload.message?.ts,
    });
  }
}

/** Slack sends the payload as one form field holding JSON. Anything else reads as nothing. */
function parsePayload(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
