import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { CURRENCY_DISPLAYS, DATE_FORMATS, type Notation, Regional, TIME_FORMATS } from "../domain/Settings.ts"

/*
 * Instellingen → Regio, read (M3.1; widgets/05 §2.2): the workspace's language and notation, in `workspaces.regional`,
 * its reporting currency, in `workspaces.currency` (what every figure is converted into), and its timezone, in
 * `workspaces.timezone` (what Start's days and the facts are counted in). A workspace that never saved the page reads
 * the defaults: Dutch, day-month-year, 24 hours, Monday. Instellingen · Bekijken.
 */

const decode = Schema.decodeUnknownEffect(Regional)

/** The settings as stored, on the caller's transaction. */
export const loadRegional = Effect.fn("Workspaces.loadRegional")(function*(
  sql: SqlClient.SqlClient,
  workspaceId: string
) {
  const [row] = yield* sql<{
    language: string | null
    dateFormat: string | null
    timeFormat: string | null
    weekStart: string | null
    currency: string
    timezone: string
  }>`
    select regional->>'language' as language, regional->>'date_format' as date_format,
           regional->>'time_format' as time_format, regional->>'week_start' as week_start, currency, timezone
    from workspaces where id = ${workspaceId}`
  if (row === undefined) return yield* Effect.die(`no workspace ${workspaceId}`)
  const currency = row.currency.trim()
  return yield* decode({
    language: row.language ?? "nl-NL",
    currencyDisplay: (CURRENCY_DISPLAYS as ReadonlyArray<string>).includes(currency) ? currency : "EUR",
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

/**
 * How the console writes dates and times here, for the frame: any member's, so no permission beyond membership. Only
 * the two fields, each its default when what is stored is not one Regio offers: the frame never fails on it.
 */
export const notationOf = Effect.fn("Workspaces.notation")(function*() {
  const { workspaceId } = yield* CurrentPrincipal
  const db = yield* Db
  const [row] = yield* db.scoped((sql) =>
    sql<{ dateFormat: string | null; timeFormat: string | null }>`
      select regional->>'date_format' as date_format, regional->>'time_format' as time_format
      from workspaces where id = ${workspaceId}`
  )
  const dateFormat = DATE_FORMATS.find((f) => f === row?.dateFormat) ?? "DD MMM YYYY"
  const timeFormat = TIME_FORMATS.find((f) => f === row?.timeFormat) ?? "24h"
  return { dateFormat, timeFormat } satisfies Notation
})
