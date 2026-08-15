import { Module } from '@nestjs/common';
import { InstallationCoreModule } from '../core/installation-core.module';
import { InstallationWriteService } from './installation-write.service';

@Module({
  imports: [InstallationCoreModule],
  providers: [InstallationWriteService],
  exports: [InstallationWriteService],
})
export class InstallationWriteModule {}
