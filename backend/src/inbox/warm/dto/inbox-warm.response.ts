import { ApiProperty } from '@nestjs/swagger';
import { RECENT_DRAFTS_VALUES, RecentDrafts } from '../../core/entities/inbox-filters.interface';

/**
 * The build filters a pin stands for, nested rather than flattened onto the pin.
 *
 * Nested because this is exactly the shape the client compares against what it is currently
 * showing, and exactly the shape it builds a link out of. Flattened, both of those would be a
 * reassembly the client has to get right - and would quietly become ambiguous the day a third
 * build filter arrives.
 */
export class InboxWarmFiltersResponse {
  @ApiProperty()
  includeApproved: boolean;

  @ApiProperty({ enum: RECENT_DRAFTS_VALUES })
  recentDrafts: RecentDrafts;
}

export class InboxWarmPinResponse {
  @ApiProperty({
    description:
      'A stable identity for this pin, and the order the list is sorted in. Opaque to the ' +
      'client: compare `filters`, not this.',
  })
  key: string;

  @ApiProperty({ type: InboxWarmFiltersResponse })
  filters: InboxWarmFiltersResponse;

  @ApiProperty({ description: 'ISO 8601.' })
  pinnedAt: string;
}

export class InboxWarmResponse {
  @ApiProperty({
    type: [InboxWarmPinResponse],
    description:
      'Every view kept ready, in a stable order. Sent in full by every route here, so a client ' +
      'never has to work out what a change did.',
  })
  pins: InboxWarmPinResponse[];

  @ApiProperty({
    description:
      'How many are allowed. Sent rather than assumed, so the client can say "2 of 3" without ' +
      'a constant of its own to keep in step.',
  })
  max: number;
}
