import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../core/entities/notification-type.enum';
import {
  BOT_MODES,
  BotMode,
  PokeSettings,
  REVIEW_REQUEST_RESOLUTIONS,
  ReviewRequestResolution,
} from '../core/poke-settings';

/**
 * What somebody has switched off about pokes, complete.
 *
 * Complete rather than "what differs from the default", the same way InboxSettingsResponse is:
 * the client holds this as the settings and sends it back whole, so a field it never had to fill
 * in is a field it cannot get wrong.
 *
 * `implements PokeSettings` so this and the settings cannot disagree about what a field is
 * called - a field added to one and forgotten in the other does not compile.
 */
export class PokeSettingsResponse implements PokeSettings {
  @ApiProperty({
    enum: NotificationType,
    isArray: true,
    description:
      'The kinds of poke this user has turned off, everywhere. Empty means every kind is on, ' +
      'which is also what an account that has never touched the settings answers - and what a ' +
      'kind added after they last saved will answer, since only the noes are stored.',
  })
  mutedTypes: NotificationType[];

  @ApiProperty({
    enum: REVIEW_REQUEST_RESOLUTIONS,
    description:
      'When a review request poke is struck through once somebody else reviews. `any_review` ' +
      'strikes it through at the first verdict from anybody. `strict` waits until GitHub no ' +
      'longer lists this user, or the team the request came through, as a requested reviewer. ' +
      'An account that has never touched the settings answers `any_review`.',
  })
  reviewRequestResolution: ReviewRequestResolution;

  @ApiProperty({
    enum: BOT_MODES,
    description:
      'Which bots can poke this user. `all`: anything a bot does - a review, a request for one, ' +
      'a merge, auto-merge armed. `none`: nothing a bot does, by the automatic idea of who a ' +
      'bot is - GitHub Apps, and logins ending in `-bot`. `custom`: the same silence, with that ' +
      'idea corrected by `botAccounts` and `humanAccounts`, which count under `custom` only. ' +
      'A review request a bot made on a person’s pull request counts as that person’s, and ' +
      'comments and mentions from a bot never poke anybody. An account that has never touched ' +
      'the settings answers `all`.',
  })
  botMode: BotMode;

  @ApiProperty({
    type: [String],
    description:
      'Logins this user counts as bots though GitHub calls them users - a machine account ' +
      'driven by a personal token. Under `custom` only. Lowercased, without `@` or `[bot]`.',
  })
  botAccounts: string[];

  @ApiProperty({
    type: [String],
    description:
      'Logins this user counts as people, whatever GitHub or their name says. Wins over ' +
      '`botAccounts` where a login is on both. Lowercased, without `@` or `[bot]`.',
  })
  humanAccounts: string[];

  @ApiProperty({
    description:
      'Whether this user gets a daily digest of the pull requests still waiting on their ' +
      'review. Off for an account that has never touched the settings: unlike every other ' +
      'kind here it is a message on a schedule rather than an answer to a webhook, so it is ' +
      'asked for rather than assumed.',
  })
  digestEnabled: boolean;

  @ApiProperty({
    minimum: 0,
    maximum: 23,
    description:
      "The hour the digest is sent, read in this user's own timezone. Nine for an account that " +
      'has never touched the settings. A digest is sent at most once a local day, so changing ' +
      "this after today's has gone takes effect tomorrow.",
  })
  digestHour: number;
}
