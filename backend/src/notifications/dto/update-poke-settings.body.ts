import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsTimeZone,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ALL_NOTIFICATION_TYPES, NotificationType } from '../core/entities/notification-type.enum';
import {
  BOT_LIST_KINDS,
  BOT_MODES,
  BotListKind,
  BotMode,
  REVIEW_REQUEST_RESOLUTIONS,
  ReviewRequestResolution,
} from '../core/poke-settings';

/**
 * A GitHub login - letters, digits and hyphens, at most 39 - with the `@` somebody types in
 * front of a handle and the `[bot]` GitHub puts after an app's. Surrounding spaces are allowed
 * through, since they are trimmed before anything is stored.
 */
const ACCOUNT_LOGIN = /^\s*@?[a-z0-9][a-z0-9-]{0,38}(\[bot\])?\s*$/i;

/** Plenty for the handful of machines anybody's organisation runs, and a bound on the row. */
const MAX_ACCOUNTS = 100;

/**
 * A full replacement, not a patch: unmuting is spelled by sending the set without that type in
 * it, so a merge would make it unspellable.
 *
 * Bounded by the number of types there are, which is the only bound that means anything here -
 * a longer list is either a duplicate or a value the normalizer is about to drop, and neither is
 * worth storing. Values themselves are checked against the enum, so a retired type is a 400
 * rather than a silent no-op, which is the more useful answer to a client that has gone stale.
 */
export class UpdatePokeSettingsBody {
  @ApiProperty({ enum: NotificationType, isArray: true })
  @IsArray()
  @ArrayMaxSize(ALL_NOTIFICATION_TYPES.length)
  @IsEnum(NotificationType, { each: true })
  mutedTypes: NotificationType[];

  /**
   * Optional, unlike the list above, because a replacement that leaves it out has an obvious
   * meaning - the default - and a client built before the setting existed sends exactly that.
   * A value that is present is checked, for the same reason a retired type is: a client that
   * spells the setting wrong should be told, not humoured.
   */
  @ApiPropertyOptional({ enum: REVIEW_REQUEST_RESOLUTIONS })
  @IsOptional()
  @IsIn(REVIEW_REQUEST_RESOLUTIONS)
  reviewRequestResolution?: ReviewRequestResolution;

  /**
   * Optional and left alone when absent, like the digest below: a client from before these
   * existed must not be able to let bots back in, or empty a list, by not knowing about them. A
   * value that is present is checked, like the review request setting.
   */
  @ApiPropertyOptional({ enum: BOT_MODES })
  @IsOptional()
  @IsIn(BOT_MODES)
  botMode?: BotMode;

  @ApiPropertyOptional({ enum: BOT_LIST_KINDS })
  @IsOptional()
  @IsIn(BOT_LIST_KINDS)
  botListKind?: BotListKind;

  /**
   * A login each, the way somebody types one: an `@` or a `[bot]` is forgiven, and both are
   * dropped before anything is stored. Anything that could not be a GitHub login is refused
   * rather than stored to match nothing - a typo that silently never applies is the failure
   * nobody reports, because it looks like the feature not working.
   */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ACCOUNTS)
  @Matches(ACCOUNT_LOGIN, { each: true })
  botList?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  digestEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 23 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  digestHour?: number;

  /**
   * The reader's IANA zone, which only the browser knows, sent with every save so somebody who
   * moves is followed. Rejected rather than dropped when unknown: a digest stored against a zone
   * nothing can read is one that silently never arrives.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
