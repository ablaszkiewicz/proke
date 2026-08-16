import { Module } from '@nestjs/common';
import { CryptoModule } from '../../../shared/crypto/crypto.module';
import { SlackWorkspaceCoreModule } from '../core/slack-workspace-core.module';
import { SlackWorkspaceWriteService } from './slack-workspace-write.service';

@Module({
  imports: [SlackWorkspaceCoreModule, CryptoModule],
  providers: [SlackWorkspaceWriteService],
  exports: [SlackWorkspaceWriteService],
})
export class SlackWorkspaceWriteModule {}
