import { MongoMemoryServer } from 'mongodb-memory-server';

const HANDLE = '__prokeMongod__';

/**
 * One in-memory Mongo for the whole run, started before any spec.
 *
 * Each spec used to start and stop its own inside `forRootAsync`, which meant a stop racing the
 * next spec's start over the same port and binary lock. When that race was lost the server never
 * came up, mongoose sat in server selection for its full 30s default, and every database-touching
 * test in that file timed out at once - looking like a product bug and reproducing roughly never.
 *
 * Specs still get a database each (see `rootMongooseTestModule`), so isolation is unchanged.
 */
export default async function globalSetup(): Promise<void> {
  const mongod = await MongoMemoryServer.create();

  // globalSetup and globalTeardown are separate module registries; globalThis is what they share.
  (globalThis as any)[HANDLE] = mongod;
  process.env.MONGO_TEST_URI = mongod.getUri();
}

export async function globalTeardown(): Promise<void> {
  const mongod: MongoMemoryServer | undefined = (globalThis as any)[HANDLE];

  await mongod?.stop();
}
