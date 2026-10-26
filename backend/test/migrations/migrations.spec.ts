import { randomUUID } from 'crypto';
import { Connection, createConnection, mongo } from 'mongoose';
import { Migration } from '../../src/migrations/migration.interface';
import { MIGRATIONS } from '../../src/migrations/migrations';
import { MIGRATIONS_COLLECTION, runMigrations } from '../../src/migrations/run-migrations';

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
});
