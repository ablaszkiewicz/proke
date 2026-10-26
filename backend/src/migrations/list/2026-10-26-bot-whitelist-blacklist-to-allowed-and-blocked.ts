import { mongo } from 'mongoose';
import { Migration } from '../migration.interface';

/** The index the router's "has anybody whitelisted this bot" was asked against. */
const LEGACY_INDEX = 'pokeSettings.botList_1';

/** What dropping an index that is already gone says - or the collection it would be on. */
const ALREADY_GONE = ['IndexNotFound', 'NamespaceNotFound'];

/** Every row this has anything to do with, and - once it has run - none at all. */
const LEGACY_ROWS = {
  $or: [
    { 'pokeSettings.botListKind': { $exists: true } },
    { 'pokeSettings.botList': { $exists: true } },
  ],
};

/**
 * The one list and its whitelist-or-blacklist switch, turned into a list for each mode.
 *
 * Before: `botListKind` said whether `botList` was a whitelist or a blacklist, read the same way
 * under `all` and `none`. After: `none` reads `allowedBots` and `all` reads `blockedBots`, and
 * there is no switch. Two of the four pairings the switch made were near enough empty - every
 * bot plus a whitelist only let some bots' comments in, no bots plus a blacklist only caught
 * accounts nothing else took for a bot - so the list's kind now follows the mode.
 *
 *  - A whitelist becomes `allowedBots`, and a blacklist `blockedBots`, whatever the mode. Where
 *    the two agreed - no bots and a whitelist, every bot and a blacklist - nothing changes. Where
 *    they did not, the list is kept for the mode that reads it, and stops doing the little it
 *    did until somebody switches to it.
 *  - `botMode` is left alone.
 *
 * Runs after 2026-10-26-bot-whitelist-blacklist, which made the list, and does not change it -
 * that one is deployed, and has run as it was.
 *
 * The old fields go, along with the index on the list. That is safe with the previous backend
 * still serving because nobody on production had a single login on the list when this was
 * written: that backend finds no list, reads it as an empty blacklist, and does what it did.
 */
export const botWhitelistBlacklistToAllowedAndBlocked: Migration = {
  id: '2026-10-26-bot-whitelist-blacklist-to-allowed-and-blocked',
  up: async (db) => {
    const users = db.collection('users');
    const counts = { rows: 0, allowed: 0, blocked: 0 };

    for await (const user of users.find(LEGACY_ROWS, { projection: { pokeSettings: 1 } })) {
      const settings = user.pokeSettings ?? {};
      const list = logins(settings.botList);
      const field = settings.botListKind === 'whitelist' ? 'allowedBots' : 'blockedBots';

      await users.updateOne(
        { _id: user._id },
        {
          ...(list.length > 0 ? { $set: { [`pokeSettings.${field}`]: list } } : {}),
          $unset: { 'pokeSettings.botListKind': '', 'pokeSettings.botList': '' },
        },
      );

      counts.rows += 1;
      counts.allowed += list.length > 0 && field === 'allowedBots' ? 1 : 0;
      counts.blocked += list.length > 0 && field === 'blockedBots' ? 1 : 0;
    }

    await dropIndex(users, LEGACY_INDEX);

    return (
      `moved the bot list off ${counts.rows} (${counts.allowed} to allowed bots, ` +
      `${counts.blocked} to blocked bots)`
    );
  },
};

/** The strings off a stored list, left as they were spelled - the backend normalises on read. */
function logins(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((login): login is string => typeof login === 'string' && login.length > 0)
    : [];
}

async function dropIndex(collection: mongo.Collection, name: string): Promise<void> {
  try {
    await collection.dropIndex(name);
  } catch (error) {
    if (!ALREADY_GONE.includes((error as { codeName?: string })?.codeName ?? '')) {
      throw error;
    }
  }
}
