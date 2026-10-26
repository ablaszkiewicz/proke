import { randomUUID } from 'crypto';
import { Connection, createConnection, mongo } from 'mongoose';
import { botWhitelistBlacklist } from '../../src/migrations/list/2026-10-26-bot-whitelist-blacklist';
import { botWhitelistBlacklistToAllowedAndBlocked } from '../../src/migrations/list/2026-10-26-bot-whitelist-blacklist-to-allowed-and-blocked';
import { Migration } from '../../src/migrations/migration.interface';
import { MIGRATIONS } from '../../src/migrations/migrations';
import { MIGRATIONS_COLLECTION, runMigrations } from '../../src/migrations/run-migrations';
import { normalizePokeSettings } from '../../src/notifications/core/poke-settings';

/**
 * `pnpm migrate`, against a database of its own per test.
 *
 * Straight onto the driver rather than through the app, because that is how the migrations run:
 * in their own process, before the server that reads what they wrote has started.
 */
describe('Migrations', () => {
  let connection: Connection;
  let db: mongo.Db;

  beforeEach(async () => {
    const uri = process.env.MONGO_TEST_URI!.replace(/\/$/, '');
    connection = await createConnection(`${uri}/proke-${randomUUID()}`).asPromise();
    db = connection.db!;
  });

  afterEach(async () => {
    await connection.close();
  });

  const quiet = () => undefined;

  const recorded = async () =>
    (await db.collection(MIGRATIONS_COLLECTION).find().toArray()).map((row) => row._id);

  describe('the runner', () => {
    const counting = (id: string, calls: string[]): Migration => ({
      id,
      up: async () => {
        calls.push(id);
        return 'done';
      },
    });

    it('runs each migration once, oldest first, and remembers it', async () => {
      // given
      const calls: string[] = [];
      const list = [counting('2026-01-01-first', calls), counting('2026-01-02-second', calls)];

      // when
      const first = await runMigrations(db, list, quiet);
      const second = await runMigrations(db, list, quiet);

      // then
      expect(first).toEqual(['2026-01-01-first', '2026-01-02-second']);
      expect(second).toEqual([]);
      expect(calls).toEqual(['2026-01-01-first', '2026-01-02-second']);
      expect((await recorded()).sort()).toEqual(['2026-01-01-first', '2026-01-02-second']);
    });

    it('runs only the one appended since last time', async () => {
      // given
      const calls: string[] = [];
      await runMigrations(db, [counting('2026-01-01-first', calls)], quiet);

      // when
      await runMigrations(
        db,
        [counting('2026-01-01-first', calls), counting('2026-01-02-second', calls)],
        quiet,
      );

      // then
      expect(calls).toEqual(['2026-01-01-first', '2026-01-02-second']);
    });

    it('stops at one that throws, remembers nothing of it, and starts it again next time', async () => {
      // given
      const calls: string[] = [];
      let attempts = 0;
      const flaky: Migration = {
        id: '2026-01-02-flaky',
        up: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error('lost the connection');
          }
          return 'done';
        },
      };
      const list = [
        counting('2026-01-01-first', calls),
        flaky,
        counting('2026-01-03-third', calls),
      ];

      // when
      await expect(runMigrations(db, list, quiet)).rejects.toThrow('lost the connection');

      // then - the one after it never ran, and the failed one is not recorded as done
      expect(calls).toEqual(['2026-01-01-first']);
      expect(await recorded()).toEqual(['2026-01-01-first']);

      // and - the next deploy picks up where this one stopped
      expect(await runMigrations(db, list, quiet)).toEqual([
        '2026-01-02-flaky',
        '2026-01-03-third',
      ]);
    });

    it('runs nothing from a list with an id in it twice, or out of order', async () => {
      // given
      const calls: string[] = [];

      // when
      const twice = runMigrations(
        db,
        [counting('2026-01-01-first', calls), counting('2026-01-01-first', calls)],
        quiet,
      );
      const backwards = runMigrations(
        db,
        [counting('2026-01-02-second', calls), counting('2026-01-01-first', calls)],
        quiet,
      );

      // then
      await expect(twice).rejects.toThrow('in the list twice');
      await expect(backwards).rejects.toThrow('which is newer');
      expect(calls).toEqual([]);
    });

    it('holds the real list to the same rules', async () => {
      // when
      const ran = await runMigrations(db, MIGRATIONS, quiet);

      // then - every one of them, on an empty database, without throwing
      expect(ran).toEqual(MIGRATIONS.map((migration) => migration.id));
    });
  });

  /**
   * "Configure yourself" and its two lists becoming the bots switch and its one list. What each
   * reads as afterwards is checked through normalizePokeSettings, which is what the server does.
   */
  describe('the bot whitelist and blacklist', () => {
    const users = () => db.collection('users');

    const insert = async (pokeSettings?: object) => {
      const { insertedId } = await users().insertOne({
        githubId: randomUUID(),
        ...(pokeSettings ? { pokeSettings: { mutedTypes: [], ...pokeSettings } } : {}),
      });
      return insertedId;
    };

    const stored = async (id: mongo.ObjectId) =>
      (await users().findOne({ _id: id }))?.pokeSettings as Record<string, unknown> | undefined;

    const migrate = () => runMigrations(db, [botWhitelistBlacklist], quiet);

    it('turns custom with people listed into none with them on a whitelist', async () => {
      // given
      const id = await insert({ botMode: 'custom', humanAccounts: ['stamphog'], botAccounts: [] });

      // when
      await migrate();

      // then
      expect(await stored(id)).toEqual({
        mutedTypes: [],
        botMode: 'none',
        botListKind: 'whitelist',
        botList: ['stamphog'],
      });
    });

    it('turns custom with bots listed into none with them on a blacklist', async () => {
      // given
      const id = await insert({ botMode: 'custom', botAccounts: ['release-runner'] });

      // when
      await migrate();

      // then
      expect(await stored(id)).toMatchObject({
        botMode: 'none',
        botListKind: 'blacklist',
        botList: ['release-runner'],
      });
    });

    it('keeps the whitelist where custom had both lists filled in', async () => {
      // given
      const id = await insert({
        botMode: 'custom',
        botAccounts: ['release-runner'],
        humanAccounts: ['github-merge-queue'],
      });

      // when
      await migrate();

      // then - the merge queue still pokes; the release runner's noise is back, and visible
      expect(await stored(id)).toEqual({
        mutedTypes: [],
        botMode: 'none',
        botListKind: 'whitelist',
        botList: ['github-merge-queue'],
      });
    });

    it('turns custom with nothing listed into plain none', async () => {
      // given - the one shape production actually had
      const id = await insert({ botMode: 'custom', botAccounts: [], humanAccounts: [] });

      // when
      await migrate();

      // then - in the shape it wrote, which the migration after it moves on again
      expect(await stored(id)).toEqual({
        mutedTypes: [],
        botMode: 'none',
        botListKind: 'whitelist',
        botList: [],
      });
      expect(normalizePokeSettings(await stored(id)).botMode).toEqual('none');
    });

    it.each([
      { label: 'all', botMode: 'all' },
      { label: 'none', botMode: 'none' },
      { label: 'an untouched mode', botMode: undefined },
    ])(
      'drops the lists that $label kept but never read, and leaves the mode',
      async ({ botMode }) => {
        // given
        const id = await insert({
          ...(botMode ? { botMode } : {}),
          botAccounts: ['release-runner'],
          humanAccounts: ['stamphog'],
        });

        // when
        await migrate();

        // then - carried over, they would start doing something nobody had seen them do
        expect(await stored(id)).toEqual({ mutedTypes: [], ...(botMode ? { botMode } : {}) });
      },
    );

    it('leaves everybody else alone', async () => {
      // given
      const untouched = await insert();
      const muted = await insert({ mutedTypes: ['issue_comment'], botMode: 'none' });

      // when
      await migrate();

      // then
      expect(await stored(untouched)).toBeUndefined();
      expect(await stored(muted)).toEqual({ mutedTypes: ['issue_comment'], botMode: 'none' });
    });

    it('changes nothing the second time', async () => {
      // given
      const id = await insert({ botMode: 'custom', humanAccounts: ['stamphog'] });
      await botWhitelistBlacklist.up(db);
      const once = await stored(id);

      // when - not through the runner, which would skip it: the migration itself has to be safe
      const summary = await botWhitelistBlacklist.up(db);

      // then
      expect(await stored(id)).toEqual(once);
      expect(summary).toContain('custom became none for 0 with a whitelist');
    });

    it('drops the index on the old list of people', async () => {
      // given
      await users().createIndex({ 'pokeSettings.humanAccounts': 1 }, { sparse: true });

      // when
      await migrate();

      // then
      const names = (await users().indexes()).map((index) => index.name);
      expect(names).not.toContain('pokeSettings.humanAccounts_1');
    });

    it('says what it did in counts, and nothing anybody could be found by', async () => {
      // given
      await insert({ botMode: 'custom', humanAccounts: ['stamphog'] });
      const lines: string[] = [];

      // when
      await runMigrations(db, [botWhitelistBlacklist], (line) => lines.push(line));

      // then - this lands in a public CI log
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('custom became none for 1 with a whitelist');
      expect(lines[0]).not.toContain('stamphog');
    });
  });

  /**
   * The one list and its whitelist-or-blacklist switch becoming a list for each mode. Runs on a
   * database the migration above has already been through.
   */
  describe('the bot list, split by mode', () => {
    const users = () => db.collection('users');

    const insert = async (pokeSettings?: object) => {
      const { insertedId } = await users().insertOne({
        githubId: randomUUID(),
        ...(pokeSettings ? { pokeSettings: { mutedTypes: [], ...pokeSettings } } : {}),
      });
      return insertedId;
    };

    const stored = async (id: mongo.ObjectId) =>
      (await users().findOne({ _id: id }))?.pokeSettings as Record<string, unknown> | undefined;

    const migrate = () => runMigrations(db, [botWhitelistBlacklistToAllowedAndBlocked], quiet);

    it('turns no bots and a whitelist into no bots and allowed bots', async () => {
      // given
      const id = await insert({ botMode: 'none', botListKind: 'whitelist', botList: ['stamphog'] });

      // when
      await migrate();

      // then
      expect(await stored(id)).toEqual({
        mutedTypes: [],
        botMode: 'none',
        allowedBots: ['stamphog'],
      });
    });

    it('turns every bot and a blacklist into every bot and blocked bots', async () => {
      // given
      const id = await insert({ botMode: 'all', botListKind: 'blacklist', botList: ['codecov'] });

      // when
      await migrate();

      // then
      expect(await stored(id)).toEqual({
        mutedTypes: [],
        botMode: 'all',
        blockedBots: ['codecov'],
      });
    });

    it.each([
      { botMode: 'all', botListKind: 'whitelist', field: 'allowedBots' },
      { botMode: 'none', botListKind: 'blacklist', field: 'blockedBots' },
    ])(
      'keeps a $botListKind under $botMode for the mode that reads it',
      async ({ botMode, botListKind, field }) => {
        // given - one of the two pairings that no longer exist
        const id = await insert({ botMode, botListKind, botList: ['release-runner'] });

        // when
        await migrate();

        // then - the mode is left as it was, and the list waits for the other one
        expect(await stored(id)).toEqual({
          mutedTypes: [],
          botMode,
          [field]: ['release-runner'],
        });
      },
    );

    it('reads a list with no kind as the blacklist it defaulted to', async () => {
      // given
      const id = await insert({ botList: ['codecov'] });

      // when
      await migrate();

      // then
      expect(await stored(id)).toEqual({ mutedTypes: [], blockedBots: ['codecov'] });
    });

    it('drops an empty list and its kind, leaving the mode', async () => {
      // given - the one shape production actually had
      const id = await insert({ botMode: 'all', botListKind: 'blacklist', botList: [] });

      // when
      await migrate();

      // then
      expect(await stored(id)).toEqual({ mutedTypes: [], botMode: 'all' });
    });

    it('leaves everybody else alone', async () => {
      // given
      const untouched = await insert();
      const muted = await insert({ mutedTypes: ['issue_comment'], botMode: 'none' });

      // when
      await migrate();

      // then
      expect(await stored(untouched)).toBeUndefined();
      expect(await stored(muted)).toEqual({ mutedTypes: ['issue_comment'], botMode: 'none' });
    });

    it('changes nothing the second time', async () => {
      // given
      const id = await insert({ botMode: 'none', botListKind: 'whitelist', botList: ['stamphog'] });
      await botWhitelistBlacklistToAllowedAndBlocked.up(db);
      const once = await stored(id);

      // when - not through the runner, which would skip it: the migration itself has to be safe
      const summary = await botWhitelistBlacklistToAllowedAndBlocked.up(db);

      // then
      expect(await stored(id)).toEqual(once);
      expect(summary).toContain('moved the bot list off 0');
    });

    it('drops the index on the old list', async () => {
      // given
      await users().createIndex({ 'pokeSettings.botList': 1 }, { sparse: true });

      // when
      await migrate();

      // then
      const names = (await users().indexes()).map((index) => index.name);
      expect(names).not.toContain('pokeSettings.botList_1');
    });

    it('says what it did in counts, and nothing anybody could be found by', async () => {
      // given
      await insert({ botMode: 'none', botListKind: 'whitelist', botList: ['stamphog'] });
      const lines: string[] = [];

      // when
      await runMigrations(db, [botWhitelistBlacklistToAllowedAndBlocked], (line) =>
        lines.push(line),
      );

      // then - this lands in a public CI log
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('moved the bot list off 1 (1 to allowed bots');
      expect(lines[0]).not.toContain('stamphog');
    });

    it('takes configure-yourself all the way to allowed bots, with the migration before it', async () => {
      // given - a row from before either ran
      const id = await insert({ botMode: 'custom', humanAccounts: ['github-merge-queue'] });

      // when
      await runMigrations(db, MIGRATIONS, quiet);

      // then - read the way the server reads it
      expect(await stored(id)).toEqual({
        mutedTypes: [],
        botMode: 'none',
        allowedBots: ['github-merge-queue'],
      });
      expect(normalizePokeSettings(await stored(id))).toMatchObject({
        botMode: 'none',
        allowedBots: ['github-merge-queue'],
        blockedBots: [],
      });
    });
  });
});
