import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from '../analytics/analytics.service';
import { CurrentUserId } from '../auth/core/decorators/current-user-id.decorator';
import { InboxFiltersQuery, toInboxFilters } from './dto/inbox-filters.query';
import { InboxSettingsResponse } from './dto/inbox-settings.response';
import { InboxResponse } from './dto/inbox.response';
import { InboxService } from './inbox.service';

@Controller('inbox')
@ApiTags('Inbox')
@ApiBearerAuth()
export class InboxController {
  constructor(
    private readonly inboxService: InboxService,
    private readonly analytics: AnalyticsService,
  ) {}

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
   *
   * On the query string even though the same settings are stored on the user, and that is a
   * decision about this route rather than an oversight: reading them here would put a Mongo
   * round trip on a route that is today pure in-process cache with no I/O at all. The client
   * already holds the settings - they arrive with the user - so it says what it wants.
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
   * screen, and what it calls again when the reader changes a build filter. The scheduled sweep
   * takes the same path underneath, minus this route - see InboxWarmerService.
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

  /**
   * Replaces how this person's inbox is set up.
   *
   * The body is the same class the two routes above take on the query string, so a setting can
   * never be spelled one way when read and another when stored - the flag and list coercions
   * pass a JSON boolean or array through untouched, and reject the same things. The pipe
   * whitelists, so a client sending nothing stores nothing, which reads as the defaults; that is
   * how "reset" is spelled.
   *
   * A PUT because it is the whole set every time: a setting put back to its default has to
   * overwrite the stored one, and a merge would leave it sitting there. Answers with what is now
   * stored, normalised, so the client draws the truth rather than its own request.
   */
  @Put('settings')
  @ApiResponse({ type: InboxSettingsResponse })
  public async updateSettings(
    @CurrentUserId() userId: string,
    @Body() body: InboxFiltersQuery,
  ): Promise<InboxSettingsResponse> {
    const settings = await this.inboxService.updateSettingsForUser(userId, toInboxFilters(body));

    // Counts rather than the lists themselves: the lists are team and author names, which
    // are somebody else's, and how many there are answers the question worth asking anyway.
    this.analytics.capture(userId, 'inbox_settings_updated', {
      include_approved: settings.includeApproved,
      recent_drafts: settings.recentDrafts,
      separate_team: settings.separateTeam,
      separate_bots: settings.separateBots,
      excluded_teams_count: settings.excludedTeams.length,
      ignored_authors_count: settings.ignoredAuthors.length,
    });

    return settings;
  }
}
