import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { CURRENCY_DISPLAYS, Regional } from "../domain/Settings.ts"

/*
 * Instellingen → Regio, read (M3.1; widgets/05 §2.2): the workspace's language and notation, in `workspaces.regional`,
 * and its timezone, in `workspaces.timezone` (what Start's days and the facts are counted in). A workspace that never
 * saved the page reads the defaults: Dutch, its own currency, day-month-year, 24 hours, Monday. Instellingen · Bekijken.
 */

const decode = Schema.decodeUnknownEffect(Regional)

/** The settings as stored, on the caller's transaction. */
export const loadRegional = Effect.fn("Workspaces.loadRegional")(function*(
  sql: SqlClient.SqlClient,
  workspaceId: string
) {
  const [row] = yield* sql<{
    language: string | null
    currencyDisplay: string | null
    dateFormat: string | null
    timeFormat: string | null
    weekStart: string | null
    currency: string
    timezone: string
  }>`
    select regional->>'language' as language, regional->>'currency_display' as currency_display,
           regional->>'date_format' as date_format, regional->>'time_format' as time_format,
           regional->>'week_start' as week_start, currency, timezone
    from workspaces where id = ${workspaceId}`
  if (row === undefined) return yield* Effect.die(`no workspace ${workspaceId}`)
  const currency = row.currency.trim()
  return yield* decode({
    language: row.language ?? "nl-NL",
    currencyDisplay: row.currencyDisplay ??
      ((CURRENCY_DISPLAYS as ReadonlyArray<string>).includes(currency) ? currency : "EUR"),
    dateFormat: row.dateFormat ?? "DD MMM YYYY",
    timeFormat: row.timeFormat ?? "24h",
    weekStart: row.weekStart ?? "mon",
    timezone: row.timezone
  }).pipe(Effect.orDie)
})

export const getRegional = Effect.fn("Workspaces.getRegional")(function*() {
  yield* Policy.require("settings", 1)
  const { workspaceId } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) => loadRegional(sql, workspaceId))
})
