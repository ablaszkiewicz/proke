import { mongo } from 'mongoose';

/**
 * One change to what is stored, made once per database by `pnpm migrate`.
 *
 * Written against the driver rather than the app's models, so it keeps meaning what it meant
 * when it was written: a model is today's idea of a collection, and a migration is about the
 * day it ran.
 */
export interface Migration {
  /**
   * `YYYY-MM-DD-what-it-does`. What the `migrations` collection records once it has run, so it
   * is never changed once deployed - a changed id is a new migration, and runs again.
   */
  id: string;
  /**
   * Makes the change, and answers with a line for the log saying what it did - counts only,
   * never a login or an id, because the CI log it lands in is public.
   *
   * Two rules, both because of when it runs. It must be safe to run again over a database it
   * has already changed, since a run that dies halfway is simply run again from the top. And it
   * must leave data that the backend already deployed can still read, since that backend is
   * the one serving while it runs - and the one that keeps serving if the deploy after it fails.
   * Add and convert first; delete what the old code reads in a later release.
   */
  up: (db: mongo.Db) => Promise<string>;
}
