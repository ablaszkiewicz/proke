import { mongo } from 'mongoose';
import { Migration } from '../migration.interface';

/** The index the router's "has anybody counted this bot as a person" was asked against. */
const LEGACY_INDEX = 'pokeSettings.humanAccounts_1';

/** What dropping an index that is already gone says - or the collection it would be on. */
const ALREADY_GONE = ['IndexNotFound', 'NamespaceNotFound'];

/** Every row this has anything to do with, and - once it has run - none at all. */
const LEGACY_ROWS = {
  $or: [
    { 'pokeSettings.botMode': 'custom' },
    { 'pokeSettings.botAccounts': { $exists: true } },
    { 'pokeSettings.humanAccounts': { $exists: true } },
  ],
};

/**
 * "Configure yourself" and its two lists, turned into the bots switch and its one list.
 *
 * Before: `botMode` was `all`, `none` or `custom`, and only under `custom` did `botAccounts` add
 * bots and `humanAccounts` take them away. After: `botMode` is `all` or `none`, and
 * `botListKind` says whether `botList` is a whitelist or a blacklist, under either.
 *
 *  - `custom`, people listed: `none`, with them as its whitelist. What custom did with them.
 *  - `custom`, bots listed: `none`, with them as its blacklist. Likewise.
 *  - `custom`, both: the whitelist wins and the bots go. Losing a whitelist would silently stop
 *    pokes somebody asked for; losing a blacklist brings back noise they can see, and fix.
 *    Nobody on production had both when this was written.
 *  - `custom`, neither: `none`, with an empty whitelist, which is what custom with nothing on
 *    it already was.
 *  - `all`, `none`, or never set: lists were kept under those but never read. One list now
 *    counts under either mode, so they are dropped rather than carried over - carried over,
 *    they would start doing something nobody has seen them do.
 *
 * The old fields go everywhere, along with the index on one of them. That is safe with the
 * previous backend still serving because every list on production was empty when this was
 * written: that backend finds `none` where it found `custom`, no lists, and does what it did.
 */
export const botWhitelistBlacklist: Migration = {
  id: '2026-10-26-bot-whitelist-blacklist',
  up: async (db) => {
    const users = db.collection('users');
    const counts = { whitelist: 0, blacklist: 0, empty: 0, bothListed: 0, unusedDropped: 0 };

    for await (const user of users.find(LEGACY_ROWS, { projection: { pokeSettings: 1 } })) {
      const settings = user.pokeSettings ?? {};
      const bots = logins(settings.botAccounts);
      const people = logins(settings.humanAccounts);
      const unset = { 'pokeSettings.botAccounts': '', 'pokeSettings.humanAccounts': '' };

      if (settings.botMode !== 'custom') {
        await users.updateOne({ _id: user._id }, { $unset: unset });
        counts.unusedDropped += 1;
        continue;
      }

      const kind = people.length > 0 || bots.length === 0 ? 'whitelist' : 'blacklist';
      const list = kind === 'whitelist' ? people : bots;

      await users.updateOne(
        { _id: user._id },
        {
          $set: {
            'pokeSettings.botMode': 'none',
            'pokeSettings.botListKind': kind,
            'pokeSettings.botList': list,
          },
          $unset: unset,
        },
      );

      counts[list.length === 0 ? 'empty' : kind] += 1;
      counts.bothListed += people.length > 0 && bots.length > 0 ? 1 : 0;
    }

    await dropIndex(users, LEGACY_INDEX);

    return (
      `custom became none for ${counts.whitelist} with a whitelist, ${counts.blacklist} with a ` +
      `blacklist and ${counts.empty} with neither (${counts.bothListed} had both, and kept the ` +
      `whitelist); unused lists dropped for ${counts.unusedDropped}`
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
