import { Module } from '@nestjs/common';
import { UserWriteModule } from '../../user/write/user-write.module';
import { PokeSettingsController } from './poke-settings.controller';

/**
 * The one route that writes what pokes somebody. Reading them is the profile's job - see the
 * controller - so there is nothing else in here.
 */
@Module({
  imports: [UserWriteModule],
  controllers: [PokeSettingsController],
})
export class PokeSettingsModule {}
