import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../auth/core/decorators/current-user-id.decorator';
import { InboxFiltersQuery, toInboxFilters } from './dto/inbox-filters.query';
import { InboxResponse } from './dto/inbox.response';
import { InboxService } from './inbox.service';

@Controller('inbox')
@ApiTags('Inbox')
@ApiBearerAuth()
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  /**
   * The stored snapshot, in the piles the page draws. One cache lookup - this never calls
   * GitHub, at any age, so it is always fast enough to render behind.
   *
   * An absent `refreshedAt` means GitHub has never answered for this person: an empty inbox
   * here is "not known yet", not "nothing to do", and the client must not say otherwise.
   *
   * The filters are on the query string on both routes, because a snapshot is built under one
   * set of them - see InboxStoreService. Reading with filters nothing has been built for is an
   * ordinary miss, and the refresh behind it fills it in.
   */
  @Get()
  @ApiResponse({ type: InboxResponse })
  public async readInbox(
    @CurrentUserId() userId: string,
    @Query() query: InboxFiltersQuery,
  ): Promise<InboxResponse> {
    return this.inboxService.readForUser(userId, toInboxFilters(query));
  }

  /**
   * Asks GitHub and writes the answer down. What the client calls once it has something on
   * screen, what it calls again when the reader changes a filter, and what the scheduled sweep
   * will call on everybody's behalf.
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
  public async refreshInbox(
    @CurrentUserId() userId: string,
    @Query() query: InboxFiltersQuery,
  ): Promise<InboxResponse> {
    return this.inboxService.refreshForUser(userId, toInboxFilters(query));
  }
}
