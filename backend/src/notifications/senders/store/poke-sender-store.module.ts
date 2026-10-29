import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InMemoryCacheModule } from '../../../shared/cache/in-memory-cache.module';
import { PokeSendersEntity, PokeSendersSchema } from './entities/poke-senders.entity';
import { PokeSenderStoreService } from './poke-sender-store.service';

/**
 * Apart from the route that reads it, so the router can count and deleting an account can clear
 * the row without either pulling in the other.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: PokeSendersEntity.name, schema: PokeSendersSchema }]),
    InMemoryCacheModule,
  ],
  providers: [PokeSenderStoreService],
  exports: [PokeSenderStoreService],
})
export class PokeSenderStoreModule {}
