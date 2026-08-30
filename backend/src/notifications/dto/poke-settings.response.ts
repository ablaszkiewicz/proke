import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../core/entities/notification-type.enum';
import { PokeSettings } from '../core/poke-settings';

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
}
