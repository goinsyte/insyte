import { readFileSync } from "node:fs"

/*
 * The database the `db` project runs against: `DATABASE_URL_APP` / `DATABASE_URL_OWNER` when set, else the one the API
 * Worker's own tests use (`localConnectionString` in `apps/api/wrangler.jsonc`), so a checkout pointed at a database
 * of its own writes its fixtures there and never into another's (the compose `insyte` by default).
 */

const LOCAL_DB = (() => {
  try {
    const config = readFileSync(new URL("../../../apps/api/wrangler.jsonc", import.meta.url), "utf8")
    return /"localConnectionString":\s*"postgres:\/\/[^"]*\/([A-Za-z0-9_]+)"/.exec(config)?.[1] ?? "insyte"
  } catch {
    return "insyte"
  }
})()

/** As `insyte_app`, which owns nothing and bypasses nothing. */
export const APP_URL = process.env["DATABASE_URL_APP"] ??
  "postgres://insyte_app:insyte_app_local@localhost:55443/insyte".replace(/\/insyte$/, `/${LOCAL_DB}`)

/** As `insyte_owner`, for a test that makes its own tables inside a transaction it rolls back. */
export const OWNER_URL = process.env["DATABASE_URL_OWNER"] ??
  "postgres://insyte_owner:insyte_owner_local@localhost:55443/insyte".replace(/\/insyte$/, `/${LOCAL_DB}`)
