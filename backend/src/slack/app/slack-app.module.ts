import { Module } from '@nestjs/common';
import { SlackApiService } from './slack-api.service';
import { SlackOAuthService } from './slack-oauth.service';
import { SlackSignatureService } from './slack-signature.service';
import { SlackStateService } from './slack-state.service';

/** Everything that talks to Slack itself. No database, no proke concepts. */
@Module({
  providers: [SlackApiService, SlackOAuthService, SlackSignatureService, SlackStateService],
  exports: [SlackApiService, SlackOAuthService, SlackSignatureService, SlackStateService],
})
export class SlackAppModule {}
