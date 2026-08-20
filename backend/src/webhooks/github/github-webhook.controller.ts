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
import {
  WebhookOutcome,
  webhookActionLabel,
  webhookEventLabel,
} from '../../analytics/metrics-catalog';
import { MetricsService } from '../../analytics/metrics.service';
import { Public } from '../../auth/core/decorators/is-public';
import { GithubWebhookInstallationsService } from './github-webhook-installations.service';
import { GithubWebhookRouterService } from './github-webhook-router.service';
import { GithubWebhookSignatureService } from './github-webhook-signature.service';

const INSTALLATION_EVENTS = ['installation', 'installation_repositories'];

@Public()
@ApiExcludeController()
@Controller('webhooks/github')
export class GithubWebhookController {
  private readonly logger = new Logger(GithubWebhookController.name);

  constructor(
    private readonly signatureService: GithubWebhookSignatureService,
    private readonly installationsService: GithubWebhookInstallationsService,
    private readonly routerService: GithubWebhookRouterService,
    private readonly metrics: MetricsService,
  ) {}

  @Post()
  @HttpCode(202)
  public async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
  ): Promise<{ received: true }> {
    if (!this.signatureService.verify(request.rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const payload = request.body;
    // Stamped here rather than deeper in, because this is the last moment that is unambiguously
    // "when GitHub told us". Everything downstream is queued behind the acknowledgement below,
    // and the whole point of measuring poke latency is to see that queue.
    const receivedAt = Date.now();
    // Mapped to a closed set before it becomes a dimension. Signature verification has already
    // run, so this string is GitHub's rather than a stranger's - but GitHub adds event types,
    // and a series budget should not widen because somebody ticked a box in the app settings.
    const eventLabel = webhookEventLabel(event);

    this.metrics.count('proke.webhook.received', {
      event: eventLabel,
      action: webhookActionLabel(payload?.action),
    });

    // GitHub gives up on a delivery after 10 seconds, so acknowledge first and do the work
    // detached, or a slow Slack call gets the whole endpoint marked unhealthy.
    //
    // Which also means the response time of this endpoint says nothing about what the work
    // costs: the 202 goes out in a millisecond whether routing took 3ms or 3 seconds. The
    // duration below is the only measurement of the real thing, and its `failed` half is the
    // only count of an exception that today leaves nothing but one log line among thousands.
    //
    // Nothing here is idempotent yet. X-GitHub-Delivery is not read, so a redelivery - which
    // GitHub does on any non-2xx, and which is a button on the deliveries page - sends the poke
    // a second time. For a product whose whole job is not pestering people, that is a real cost
    // rather than the free retry it looks like.
    void this.handle(event, payload, receivedAt)
      .then(() => this.recordHandled(eventLabel, receivedAt, 'ok'))
      .catch((error) => {
        this.recordHandled(eventLabel, receivedAt, 'failed');
        this.logger.error(`Failed handling ${event}: ${error}`);
      });

    return { received: true };
  }

  private recordHandled(event: string, receivedAt: number, outcome: WebhookOutcome): void {
    this.metrics.duration('proke.webhook.duration', Date.now() - receivedAt, { event, outcome });
  }

  private async handle(event: string, payload: any, receivedAt: number): Promise<void> {
    if (INSTALLATION_EVENTS.includes(event)) {
      await this.installationsService.handle(event, payload);
      return;
    }

    await this.routerService.route(event, payload, receivedAt);
  }
}
