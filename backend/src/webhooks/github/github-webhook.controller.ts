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

    // GitHub gives up on a delivery after 10 seconds, so acknowledge first and do the work
    // detached, or a slow Slack call gets the whole endpoint marked unhealthy.
    //
    // Nothing here is idempotent yet. X-GitHub-Delivery is not read, so a redelivery - which
    // GitHub does on any non-2xx, and which is a button on the deliveries page - sends the poke
    // a second time. For a product whose whole job is not pestering people, that is a real cost
    // rather than the free retry it looks like.
    void this.handle(event, payload).catch((error) => {
      this.logger.error(`Failed handling ${event}: ${error}`);
    });

    return { received: true };
  }

  private async handle(event: string, payload: any): Promise<void> {
    if (INSTALLATION_EVENTS.includes(event)) {
      await this.installationsService.handle(event, payload);
      return;
    }

    await this.routerService.route(event, payload);
  }
}
