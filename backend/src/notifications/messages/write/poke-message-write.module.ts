import { Module } from '@nestjs/common';
import { PokeMessageCoreModule } from '../core/poke-message-core.module';
import { PokeMessageWriteService } from './poke-message-write.service';

@Module({
  imports: [PokeMessageCoreModule],
  providers: [PokeMessageWriteService],
  exports: [PokeMessageWriteService],
})
export class PokeMessageWriteModule {}
