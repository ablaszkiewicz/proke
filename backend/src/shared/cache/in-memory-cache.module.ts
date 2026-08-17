import { Module } from '@nestjs/common';
import { InMemoryCacheService } from './in-memory-cache.service';

/** Nest instantiates this once however many modules import it, so they all share one cache. */
@Module({
  providers: [InMemoryCacheService],
  exports: [InMemoryCacheService],
})
export class InMemoryCacheModule {}
