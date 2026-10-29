import { ApiProperty } from '@nestjs/swagger';

export class PokeSenderResponse {
  @ApiProperty({
    description:
      'The account, spelled the way the bot lists are: lowercased, without `@` or `[bot]`, so it ' +
      'can be put on either list as it is.',
  })
  login: string;

  @ApiProperty({
    description:
      'Whether it is a bot by the automatic idea - a GitHub App, or a login ending in `-bot` - ' +
      'whatever either list says about it.',
  })
  bot: boolean;

  @ApiProperty({ description: 'Pokes from it that reached this user.' })
  reached: number;

  @ApiProperty({
    description:
      'Pokes from it that this user’s bot settings kept back: under `none`, everything a bot ' +
      'does; under either, a bot’s comments and mentions, and anything from a blocked bot.',
  })
  held: number;

  @ApiProperty()
  lastPokedAt: Date;
}

/**
 * Who has been poking this user lately, most first.
 *
 * Counted per poke, only for organisations they listen to and kinds they have not switched off,
 * and never for comments from a GitHub App nobody has allowed: those are dropped before anybody
 * they would reach is known, and finding out who would cost the lookups that early drop exists
 * to save.
 */
export class PokeSendersResponse {
  @ApiProperty({
    description:
      'How far back this goes. An account that has not poked this user in that long is not here.',
  })
  windowDays: number;

  @ApiProperty({
    type: [PokeSenderResponse],
    description: 'At most two dozen, bots kept over people when there are more.',
  })
  senders: PokeSenderResponse[];
}
