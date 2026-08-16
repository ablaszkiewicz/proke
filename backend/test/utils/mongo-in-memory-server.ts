import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';

/**
 * Connects to the run-wide server started in globalSetup, on a database of its own.
 *
 * The suite runs with --runInBand, so specs do not currently overlap; the per-spec database is
 * what means they would not have to. It also keeps a spec that leaves documents behind from
 * being a spec that breaks the next one.
 */
export const rootMongooseTestModule = (options: MongooseModuleOptions = {}) => {
  const uri = process.env.MONGO_TEST_URI;

  if (!uri) {
    throw new Error(
      'MONGO_TEST_URI is unset - test/utils/global-mongo.ts should have started the server. ' +
        'Run through the e2e jest config rather than invoking a spec directly.',
    );
  }

  return MongooseModule.forRoot(`${uri.replace(/\/$/, '')}/proke-${randomUUID()}`, {
    // A server that is not answering is a broken harness, not a slow one. Fail in seconds with
    // a real error rather than parking every test until its own timeout fires.
    serverSelectionTimeoutMS: 5000,
    ...options,
  });
};

/**
 * Kept so specs read the same as before. The server itself outlives every spec and is stopped
 * in globalTeardown; dropping the per-spec database is not worth the wait, since the process
 * and its storage go away with it.
 */
export const closeInMemoryMongoServer = async () => {};
