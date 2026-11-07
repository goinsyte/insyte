import bootstrap from "./migrations/0001_bootstrap.ts"
import platform from "./migrations/0002_platform.ts"

/**
 * Every migration, by its permanent key, in the order they were written (06; 15). A new migration is a new file and a
 * new line here; a merged one is never edited or reordered (`scripts/migrations-check.ts`).
 */
export const Migrations = {
  "0001_bootstrap": bootstrap,
  "0002_platform": platform
}
