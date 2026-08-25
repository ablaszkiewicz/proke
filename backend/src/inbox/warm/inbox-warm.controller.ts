import { ConflictException, Controller, Delete, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from '../../analytics/analytics.service';
import { CurrentUserId } from '../../auth/core/decorators/current-user-id.decorator';
import { InboxBuildFiltersQuery, toInboxBuildFilters } from '../dto/inbox-filters.query';
import { InboxWarmPin, MAX_WARM_PINS } from './core/entities/inbox-warm-pin.interface';
import { InboxWarmResponse } from './dto/inbox-warm.response';
import { InboxWarmReadService } from './read/inbox-warm-read.service';
import { InboxWarmWriteService } from './write/inbox-warm-write.service';

/**
 * The views somebody has asked to be kept ready.
 *
 * ## Why the filters are on the query string
 *
 * Because they are on the query string of the two routes next door, and a pin is named by the
 * same thing an inbox is read by. It means the client builds one set of parameters and uses it
 * for all four, and it means a warm route can be pasted into a terminal and read.
 *
 * Only the build half is taken. A pin is a set of build filters and nothing else, because those
 * are what a snapshot is *filed* under - see inbox-store.service.ts. Warming one build key makes
 * every combination of view filters on top of it instant as well, so a pin carrying
 * `ignoredAuthors` would be recording something that changes nothing.
 *
 * ## Why every route answers with the whole list
 *
 * So the client never has to work out what its own request did. A press on a switch that was
 * already on, a removal of something already removed, and a refusal at capacity all come back as
 * the same shape - the truth - and the panel simply draws it.
 *
 * ## Why this is not on the inbox response
 *
 * It would save a request, and it would put a Mongo round trip on `GET /inbox`, which is today
 * pure in-process cache with no I/O at all. The whole shape of that route is that it is never
 * slow; spending its budget on a checkbox is the wrong trade. One read here on page load
 * instead.
 */
@Controller('inbox/warm')
@ApiTags('Inbox')
@ApiBearerAuth()
export class InboxWarmController {
  constructor(
    private readonly warmReadService: InboxWarmReadService,
    private readonly warmWriteService: InboxWarmWriteService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get()
  @ApiResponse({ type: InboxWarmResponse })
  public async readWarm(@CurrentUserId() userId: string): Promise<InboxWarmResponse> {
    return respond(await this.warmReadService.readForUser(userId));
  }

  /**
   * Keeps the given view ready. Idempotent: pressing it on something already pinned is a
   * success, because what the caller asked for is the state and not the transition.
   *
   * A 409 only when the person is already holding `MAX_WARM_PINS` others. The client knows the
   * list and should have disabled the control before this, so reaching here means two tabs - and
   * the right answer to that is the client re-reading rather than a body it has to parse.
   */
  @Put()
  @ApiResponse({ type: InboxWarmResponse })
  public async addWarm(
    @CurrentUserId() userId: string,
    @Query() query: InboxBuildFiltersQuery,
  ): Promise<InboxWarmResponse> {
    const filters = toInboxBuildFilters(query);
    const result = await this.warmWriteService.add(userId, filters);

    if (!result.ok) {
      throw new ConflictException(
        `Already keeping ${MAX_WARM_PINS} views ready. Remove one first.`,
      );
    }

    this.analytics.capture(userId, 'inbox_warm_added', {
      include_approved: filters.includeApproved,
      recent_drafts: filters.recentDrafts,
      warm_count: result.pins.length,
    });

    return respond(result.pins);
  }

  /** Idempotent in the same way: removing something that is not pinned answers with the list. */
  @Delete()
  @ApiResponse({ type: InboxWarmResponse })
  public async removeWarm(
    @CurrentUserId() userId: string,
    @Query() query: InboxBuildFiltersQuery,
  ): Promise<InboxWarmResponse> {
    const filters = toInboxBuildFilters(query);
    const pins = await this.warmWriteService.remove(userId, filters);

    this.analytics.capture(userId, 'inbox_warm_removed', {
      include_approved: filters.includeApproved,
      recent_drafts: filters.recentDrafts,
      warm_count: pins.length,
    });

    return respond(pins);
  }
}

function respond(pins: InboxWarmPin[]): InboxWarmResponse {
  return {
    pins: pins.map((pin) => ({
      key: pin.key,
      filters: pin.filters,
      pinnedAt: pin.pinnedAt.toISOString(),
    })),
    max: MAX_WARM_PINS,
  };
}
