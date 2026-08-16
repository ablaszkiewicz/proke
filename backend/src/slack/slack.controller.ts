import { Body, Controller, Delete, Get, HttpCode, Post, Query, Redirect } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../auth/core/decorators/current-user-id.decorator';
import { Public } from '../auth/core/decorators/is-public';
import { SlackConnectBody } from './dto/slack-connect.body';
import { SlackConnectionResponse } from './dto/slack-connection.response';
import { SlackService } from './slack.service';

@Controller('slack')
@ApiTags('Slack')
@ApiBearerAuth()
export class SlackController {
  constructor(private readonly slackService: SlackService) {}

  /**
   * The URL registered with Slack, and the only public thing here.
   *
   * It exists because Slack requires an https redirect and the frontend is plain http on
   * localhost in development - so the backend, which is already tunnelled for webhooks, takes
   * the callback and hands it straight back to the frontend. Nothing is spent here: the code
   * travels on to the page that can post it with a session attached.
   */
  @Public()
  @Get('oauth/callback')
  @Redirect()
  @ApiExcludeEndpoint()
  public oauthCallback(@Query() query: Record<string, string>): { url: string } {
    return { url: this.slackService.buildAppCallbackUrl(query) };
  }

  /** Where this user's pokes go, and which authorize URL would move that along. */
  @Get('connection')
  @ApiResponse({ type: SlackConnectionResponse })
  public async readConnection(@CurrentUserId() userId: string): Promise<SlackConnectionResponse> {
    return this.slackService.readConnection(userId);
  }

  /** Both authorize flows land here. Authenticated, so the code is spent for a known user. */
  @Post('connection')
  @ApiResponse({ type: SlackConnectionResponse })
  public async connect(
    @CurrentUserId() userId: string,
    @Body() body: SlackConnectBody,
  ): Promise<SlackConnectionResponse> {
    return this.slackService.connect(userId, body.code, body.state);
  }

  @Delete('connection')
  @HttpCode(204)
  public async disconnect(@CurrentUserId() userId: string): Promise<void> {
    await this.slackService.disconnect(userId);
  }

  /**
   * Proves the whole path end to end before a real notification depends on it. Failures come
   * back as a message rather than a log line - finding out is the entire point.
   */
  @Post('connection/test')
  @HttpCode(204)
  public async sendTestPoke(@CurrentUserId() userId: string): Promise<void> {
    await this.slackService.sendTestPoke(userId);
  }
}
