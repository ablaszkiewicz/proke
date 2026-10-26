import { createConnection } from 'mongoose';
import { getEnvConfig } from '../shared/configs/env-configs';
import { runMigrations } from './run-migrations';

/**
 * `pnpm migrate`: brings the database at MONGO_URL up to what this commit's code expects.
 *
 * Its own process, and never the server's. CI runs it on the runner after the image is built and
 * before it is deployed - see backend-deploy.yml - so a migration that fails stops the deploy,
 * and the backend already running carries on as it was. Locally it runs against the
 * docker-compose Mongo, or whatever MONGO_URL in `.env` says.
 *
 * Says as little as it can about the database itself. The CI log is public, and GitHub masks the
 * secret only where it appears whole - a host name in a connection error is not masked.
 */
async function main(): Promise<void> {
  const connection = await createConnection(getEnvConfig().mongo.url, {
    serverSelectionTimeoutMS: 10_000,
  })
    .asPromise()
    .catch((error: unknown) => {
      throw new Error(`Could not connect to MONGO_URL (${(error as Error)?.name ?? 'unknown'})`);
    });

  try {
    if (!connection.db) {
      throw new Error('Connected to MONGO_URL, but the driver handed back no database');
    }

    await runMigrations(connection.db);
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(`Migrations stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
