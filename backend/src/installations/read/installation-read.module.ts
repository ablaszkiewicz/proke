import { Module } from '@nestjs/common';
import { InstallationCoreModule } from '../core/installation-core.module';
import { InstallationReadService } from './installation-read.service';

@Module({
  imports: [InstallationCoreModule],
  providers: [InstallationReadService],
  exports: [InstallationReadService],
})
export class InstallationReadModule {}
