import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  DEFAULT_INBOX_FILTERS,
  InboxFilters,
  RECENT_DRAFTS_VALUES,
  RecentDrafts,
} from '../core/entities/inbox-filters.interface';

/**
 * A flag arriving on the query string.
 *
 * A query string has no booleans, only the words. The coercion is written out rather than left
 * to `enableImplicitConversion`, which the app deliberately runs without: implicit conversion
 * goes through `Boolean(value)`, so `?includeApproved=false` would arrive as `true` - see
 * shared/validation/validation-pipe.ts for the bug that cost us.
 *
 * Anything that is neither word is passed through untouched and then rejected by `@IsBoolean`,
 * so a typo is a 400 rather than a filter silently reading as off.
 */
function FilterFlag(description: string): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ type: Boolean, description }),
    IsOptional(),
    Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value)),
    IsBoolean(),
  );
}

/**
 * A filter that is one of a short list of named values.
 *
 * No coercion to do - these are words on the wire and words in the domain - so the whole job is
 * refusing anything that is not one of them. Refusing rather than falling back to the default,
 * for the same reason a mistyped boolean is a 400: a filter that quietly reads as something
 * else removes rows nobody asked to have removed.
 */
function FilterChoice(values: readonly string[], description: string): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ enum: values, description }),
    IsOptional(),
    IsIn(values),
  );
}

/**
 * The filters as they come off the wire: every one optional, because a client that has never
 * heard of a filter must keep working after we add it.
 *
 * `implements Partial<InboxFilters>` is what makes that safe. A field misspelled here, or a
 * filter added to the interface and forgotten here, is a compile error rather than an option
 * that quietly never arrives.
 */
export class InboxFiltersQuery implements Partial<InboxFilters> {
  @FilterFlag(
    'Include pull requests waiting on you that have already been approved. Off by default - ' +
      'the review they were asking for has happened.',
  )
  includeApproved?: boolean;

  @FilterChoice(
    RECENT_DRAFTS_VALUES,
    'How recently one of your drafts must have moved to get a heading of its own instead of ' +
      'going in with the rest. `off` puts every draft in the one pile. Defaults to `1d`.',
  )
  recentDrafts?: RecentDrafts;
}

/**
 * Fills the gaps from the defaults, so nothing downstream has to decide what absent meant.
 *
 * Written out field by field rather than looped over the name list, and that is the point: the
 * return type is the complete `InboxFilters`, so a filter added to the interface and forgotten
 * here does not compile. A loop would have taken it silently.
 */
export function toInboxFilters(query: InboxFiltersQuery): InboxFilters {
  return {
    includeApproved: query.includeApproved ?? DEFAULT_INBOX_FILTERS.includeApproved,
    recentDrafts: query.recentDrafts ?? DEFAULT_INBOX_FILTERS.recentDrafts,
  };
}
