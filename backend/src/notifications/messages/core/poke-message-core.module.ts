import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PokeMessageEntity, PokeMessageSchema } from './entities/poke-message.entity';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PokeMessageEntity.name, schema: PokeMessageSchema }]),
  ],
  exports: [MongooseModule],
})
export class PokeMessageCoreModule {}
