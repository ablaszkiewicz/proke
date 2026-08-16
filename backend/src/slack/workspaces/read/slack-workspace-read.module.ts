import { Module } from '@nestjs/common';
import { CryptoModule } from '../../../shared/crypto/crypto.module';
import { SlackWorkspaceCoreModule } from '../core/slack-workspace-core.module';
import { SlackWorkspaceReadService } from './slack-workspace-read.service';

@Module({
  imports: [SlackWorkspaceCoreModule, CryptoModule],
  providers: [SlackWorkspaceReadService],
  exports: [SlackWorkspaceReadService],
})
export class SlackWorkspaceReadModule {}
