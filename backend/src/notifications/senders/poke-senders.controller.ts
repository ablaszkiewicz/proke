import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../auth/core/decorators/current-user-id.decorator';
import { PokeSendersResponse } from './dto/poke-senders.response';
import { POKE_SENDERS_WINDOW_SECONDS } from './store/entities/poke-senders.entity';
import { PokeSenderStoreService } from './store/poke-sender-store.service';

/**
 * Who has been poking you. Read by the bots dialog, which suggests the bots on it.
 *
 * A route of its own rather than a field on the profile, unlike the settings: the profile is read
 * before every page under `/app` renders, and nothing but one dialog on the dashboard wants this.
 */
@Controller('notifications/senders')
@ApiTags('Notifications')
@ApiBearerAuth()
export class PokeSendersController {
  constructor(private readonly senderStore: PokeSenderStoreService) {}

  @Get()
  @ApiResponse({ type: PokeSendersResponse })
  public async readSenders(@CurrentUserId() userId: string): Promise<PokeSendersResponse> {
    return {
      windowDays: POKE_SENDERS_WINDOW_SECONDS / (24 * 60 * 60),
      senders: await this.senderStore.read(userId),
    };
  }
}
