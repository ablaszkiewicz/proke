import { mongo } from 'mongoose';
import { Migration } from './migration.interface';
import { MIGRATIONS } from './migrations';

/** One migration having run, keyed by its id. */
interface MigrationRow {
  _id: string;
  completedAt: Date;
}

/** The collection that remembers which migrations a database has had. */
export const MIGRATIONS_COLLECTION = 'migrations';

const MIGRATION_ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * What is wrong with the list itself, in words, or nothing. Checked before anything runs: an id
 * written twice, or out of order, is a mistake that is only cheap to fix before it has run.
 */
export function migrationProblems(migrations: readonly Migration[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  migrations.forEach((migration, index) => {
    if (!MIGRATION_ID.test(migration.id)) {
      problems.push(`${migration.id} is not a YYYY-MM-DD-what-it-does id`);
    }

    if (seen.has(migration.id)) {
      problems.push(`${migration.id} is in the list twice`);
    }

    if (index > 0 && migration.id < migrations[index - 1].id) {
      problems.push(`${migration.id} comes after ${migrations[index - 1].id}, which is newer`);
    }

    seen.add(migration.id);
  });

  return problems;
}

/**
 * Runs every migration this database has not had yet, in order, and answers with their ids.
 *
 * Stops at the first one that throws, and throws itself: everything after it may depend on it,
 * and a deploy should not go out on data that is half the way there. Nothing is recorded for a
 * migration until it has finished, so the next run starts it again from the top - which is why
 * every migration has to be safe to repeat.
 *
 * One runner at a time is the workflow's to promise, with its concurrency group. Two at once
 * would each run the same idempotent change, and the record is an upsert, so even that costs
 * nothing but the time.
 */
export async function runMigrations(
  db: mongo.Db,
  migrations: readonly Migration[] = MIGRATIONS,
  log: (line: string) => void = console.log,
): Promise<string[]> {
  const problems = migrationProblems(migrations);

  if (problems.length > 0) {
    throw new Error(`Running no migrations until these are fixed:\n${problems.join('\n')}`);
  }

  const rows = db.collection<MigrationRow>(MIGRATIONS_COLLECTION);
  const done = new Set(
    (await rows.find({}, { projection: { _id: 1 } }).toArray()).map((row) => row._id),
  );
  const ran: string[] = [];

  for (const migration of migrations) {
    if (done.has(migration.id)) {
      continue;
    }

    const startedAt = Date.now();
    const summary = await migration.up(db);

    await rows.updateOne(
      { _id: migration.id },
      { $setOnInsert: { completedAt: new Date() } },
      { upsert: true },
    );

    log(`${migration.id}: ${summary} (${Date.now() - startedAt}ms)`);
    ran.push(migration.id);
  }

  if (ran.length === 0) {
    log(`Nothing to migrate: all ${migrations.length} already ran`);
  }

  return ran;
}
