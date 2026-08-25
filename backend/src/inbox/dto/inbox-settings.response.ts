import { ApiProperty } from '@nestjs/swagger';
import {
  InboxFilters,
  RECENT_DRAFTS_VALUES,
  RecentDrafts,
} from '../core/entities/inbox-filters.interface';

/**
 * How somebody's inbox is set up, complete.
 *
 * Complete rather than "what differs from the default", on purpose. The client holds this as the
 * settings and sends it back whole, so a field it never had to fill in is a field it cannot get
 * wrong - and a filter added next month arrives here with its default already in place.
 *
 * `implements InboxFilters` so this and the settings cannot disagree about what a filter is
 * called: a field added to one and forgotten in the other does not compile.
 */
export class InboxSettingsResponse implements InboxFilters {
  @ApiProperty()
  includeApproved: boolean;

  @ApiProperty({ enum: RECENT_DRAFTS_VALUES })
  recentDrafts: RecentDrafts;

  @ApiProperty()
  separateTeam: boolean;

  @ApiProperty()
  separateBots: boolean;

  @ApiProperty({ type: [String], description: '`org/slug`, lowercased.' })
  excludedTeams: string[];

  @ApiProperty({ type: [String], description: 'Logins, lowercased.' })
  ignoredAuthors: string[];
}
