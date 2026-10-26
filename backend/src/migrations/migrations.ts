import { botWhitelistBlacklist } from './list/2026-10-26-bot-whitelist-blacklist';
import { Migration } from './migration.interface';

/**
 * Every migration there has ever been, oldest first. Run in this order, each once per database.
 *
 * To add one, write it under `list/` - see Migration for the two rules it has to keep - append it
 * here, and merge. CI runs it against production after the image is built and before it is
 * deployed, so the new code never starts on data it does not expect.
 *
 * Append only. Never edit, reorder or remove an entry that has been deployed: it has already run
 * as it was, and every database it ran on remembers it by id.
 */
export const MIGRATIONS: readonly Migration[] = [botWhitelistBlacklist];
