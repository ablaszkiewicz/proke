import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import {
  DEFAULT_INBOX_FILTERS,
  INBOX_FILTER_NAMES,
  InboxFilters,
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
 * The filters as they come off the wire: every one optional, because a client that has never
 * heard of a filter must keep working after we add it.
 *
 * `implements Partial<InboxFilters>` is what makes that safe. A field misspelled here, or a
 * filter added to the name list and forgotten here, is a compile error rather than an option
 * that quietly never arrives.
 */
export class InboxFiltersQuery implements Partial<InboxFilters> {
  @FilterFlag(
    'Include pull requests waiting on you that have already been approved. Off by default - ' +
      'the review they were asking for has happened.',
  )
  includeApproved?: boolean;
}

/** Fills the gaps from the defaults, so nothing downstream has to decide what absent meant. */
export function toInboxFilters(query: InboxFiltersQuery): InboxFilters {
  const filters = { ...DEFAULT_INBOX_FILTERS };

  for (const name of INBOX_FILTER_NAMES) {
    filters[name] = query[name] ?? DEFAULT_INBOX_FILTERS[name];
  }

  return filters;
}
