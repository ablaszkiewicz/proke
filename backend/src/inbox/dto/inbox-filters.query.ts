import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  DEFAULT_INBOX_FILTERS,
  InboxFilters,
  normalizeFilterList,
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
 * How many names one of the list filters may carry, and how long each may be.
 *
 * Generous enough that nobody real hits them - a GitHub login is at most 39 characters, and
 * ignoring fifty authors is a different feature - and small enough that a query string cannot be
 * turned into a payload. These are not in any cache key, so the bound is about the size of one
 * request rather than about what gets stored.
 */
const MAX_LIST_ENTRIES = 50;
const MAX_LIST_ENTRY_LENGTH = 120;

/**
 * The characters a login or an `org/slug` can be made of.
 *
 * Refusing the rest is not sanitisation - nothing here is interpolated into anything - it is the
 * same courtesy the other filters get. A name with a space in it was a mistake, and matching
 * nothing silently is the one way a filter fails that nobody reports.
 */
const LIST_ENTRY = /^[A-Za-z0-9._/-]+$/;

/**
 * A filter carrying several names, comma-separated.
 *
 * Comma-separated rather than the repeated `?a=1&a=2` form, because these end up in the address
 * bar and a reader is meant to be able to see what their inbox is filtered by. `dependabot,
 * renovate` says it; `ignoredAuthors=%5B%22dependabot%22%5D` does not.
 *
 * The repeated form is accepted anyway - it costs one line, and it is what somebody hand-editing
 * a URL is likely to reach for.
 */
function FilterList(description: string): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({ type: String, description }),
    IsOptional(),
    Transform(({ value }) => toList(value)),
    IsArray(),
    ArrayMaxSize(MAX_LIST_ENTRIES),
    IsString({ each: true }),
    MaxLength(MAX_LIST_ENTRY_LENGTH, { each: true }),
    Matches(LIST_ENTRY, { each: true }),
  );
}

/**
 * Anything that is not a string or an array of them is passed through untouched, so `@IsArray`
 * rejects it rather than this quietly turning it into something.
 *
 * An empty string is an empty list and not a list containing nothing, which is what makes
 * `?ignoredAuthors=` mean "ignore nobody" - the shape a client sends when it always sends every
 * filter.
 */
function toList(value: unknown): unknown {
  const parts = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : undefined;

  if (!parts) {
    return value;
  }

  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : part))
    .filter((part) => part !== '');
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

  @FilterFlag(
    'Give people you share a GitHub team with a heading of their own. On by default. Off puts ' +
      'them in with everyone else - it never removes them.',
  )
  separateTeam?: boolean;

  @FilterFlag(
    'Give machines a heading of their own. On by default. Off puts their pull requests in with ' +
      'everyone else - use `ignoredAuthors` to be rid of one entirely.',
  )
  separateBots?: boolean;

  @FilterList(
    'Teams of yours that should not count as yours, as `org/slug`, comma-separated. Everything ' +
      'GitHub says you are in counts by default, which is wrong for a company-wide team.',
  )
  excludedTeams?: string[];

  @FilterList(
    'Logins whose pull requests never reach you, comma-separated. Only affects the ones waiting ' +
      'on you; your own are yours.',
  )
  ignoredAuthors?: string[];
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
    separateTeam: query.separateTeam ?? DEFAULT_INBOX_FILTERS.separateTeam,
    separateBots: query.separateBots ?? DEFAULT_INBOX_FILTERS.separateBots,
    // Normalised here and only here, so no rule further in has to remember that the reader typed
    // these by hand - see normalizeFilterList.
    excludedTeams: normalizeFilterList(query.excludedTeams ?? DEFAULT_INBOX_FILTERS.excludedTeams),
    ignoredAuthors: normalizeFilterList(
      query.ignoredAuthors ?? DEFAULT_INBOX_FILTERS.ignoredAuthors,
    ),
  };
}
