import { Module } from '@nestjs/common';
import { SlackLinkCoreModule } from '../core/slack-link-core.module';
import { SlackLinkWriteService } from './slack-link-write.service';

@Module({
  imports: [SlackLinkCoreModule],
  providers: [SlackLinkWriteService],
  exports: [SlackLinkWriteService],
})
export class SlackLinkWriteModule {}
