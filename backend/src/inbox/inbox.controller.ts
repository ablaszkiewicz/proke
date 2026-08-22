import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../auth/core/decorators/current-user-id.decorator';
import { InboxResponse } from './dto/inbox.response';
import { InboxService } from './inbox.service';

@Controller('inbox')
@ApiTags('Inbox')
@ApiBearerAuth()
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  /**
   * Every open pull request that is yours or wants you, in the piles the page draws.
   *
   * Served from the stored snapshot, which is refreshed here only when there is no usable one -
   * so this stays a database read once the scheduled sweep is doing the fetching. It never fails
   * because GitHub did: a stale answer is flagged, not withheld.
   */
  @Get()
  @ApiResponse({ type: InboxResponse })
  public async readInbox(@CurrentUserId() userId: string): Promise<InboxResponse> {
    return this.inboxService.readForUser(userId);
  }
}
