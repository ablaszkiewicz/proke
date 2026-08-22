import { Controller, Get, HttpCode, Post } from '@nestjs/common';
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
   * The stored snapshot, in the piles the page draws. One Mongo lookup - this never calls
   * GitHub, at any age, so it is always fast enough to render behind.
   *
   * An absent `refreshedAt` means GitHub has never answered for this person: an empty inbox
   * here is "not known yet", not "nothing to do", and the client must not say otherwise.
   */
  @Get()
  @ApiResponse({ type: InboxResponse })
  public async readInbox(@CurrentUserId() userId: string): Promise<InboxResponse> {
    return this.inboxService.readForUser(userId);
  }

  /**
   * Asks GitHub and writes the answer down. What the client calls once it has something on
   * screen, and what the scheduled sweep will call on everybody's behalf.
   *
   * A POST because it changes what is stored, and it answers with the new snapshot so the caller
   * needs no second request. Never fails because GitHub did: an outage answers with the previous
   * snapshot and `stale`, a revoked authorization with `githubReauthRequired`.
   */
  @Post('refresh')
  // 200, not the 201 Nest gives a POST by default. Nothing is created here - the snapshot
  // is replaced - and the body is the same resource the GET answers with.
  @HttpCode(200)
  @ApiResponse({ type: InboxResponse })
  public async refreshInbox(@CurrentUserId() userId: string): Promise<InboxResponse> {
    return this.inboxService.refreshForUser(userId);
  }
}
