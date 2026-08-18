import { Module } from '@nestjs/common';
import { PokeMessageCoreModule } from '../core/poke-message-core.module';
import { PokeMessageReadService } from './poke-message-read.service';

@Module({
  imports: [PokeMessageCoreModule],
  providers: [PokeMessageReadService],
  exports: [PokeMessageReadService],
})
export class PokeMessageReadModule {}
