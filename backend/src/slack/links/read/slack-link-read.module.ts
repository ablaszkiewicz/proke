import { Module } from '@nestjs/common';
import { SlackLinkCoreModule } from '../core/slack-link-core.module';
import { SlackLinkReadService } from './slack-link-read.service';

@Module({
  imports: [SlackLinkCoreModule],
  providers: [SlackLinkReadService],
  exports: [SlackLinkReadService],
})
export class SlackLinkReadModule {}
