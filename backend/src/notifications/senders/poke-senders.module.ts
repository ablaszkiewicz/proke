import { Module } from '@nestjs/common';
import { PokeSendersController } from './poke-senders.controller';
import { PokeSenderStoreModule } from './store/poke-sender-store.module';

/**
 * The route that reads who has been poking somebody. The counting is the webhook router's, and
 * goes through the store directly.
 */
@Module({
  imports: [PokeSenderStoreModule],
  controllers: [PokeSendersController],
})
export class PokeSendersModule {}
