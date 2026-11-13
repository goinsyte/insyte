import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { CURRENCY_DISPLAYS } from "../../workspaces/domain/Settings.ts"
import { type EcbDay, ReferenceRates } from "../domain/Rates.ts"

/*
 * `fx_rates` from the ECB's reference rates (§0.4). Each night the last 90 days are written again: a night the cron
 * missed, or a currency a workspace started counting in, fills in on the next, and a day already there with the same
 * rate is left as it is. The ECB quotes everything against the euro; a row is `1 base = rate quote`, so a conversion
 * into a workspace's currency reads `base = the order's, quote = the workspace's`. The quotes are the currencies a
 * workspace can count in, crossed through the euro, rounded to the column's eight places. Weekends and the ECB's
 * holidays have no row: the readers take the latest day on or before the one they convert (`figures.ts`).
 */

/** The currencies a workspace can count in: every rate is written into each of them. */
export const QUOTES: ReadonlyArray<string> = CURRENCY_DISPLAYS

/** The ECB's days written into `fx_rates`, crossed into every quote; how many rows were new or changed. */
export const fillIn = (sql: SqlClient.SqlClient, days: ReadonlyArray<EcbDay>) => {
  const rows = days.flatMap((d) => d.rates.map((r) => ({ day: d.day, currency: r.currency, rate: r.rate })))
  if (rows.length === 0) return Effect.succeed(0)
  return Effect.map(
    sql<{ n: number }>`
      with given as (
        select d::date as day, c::char(3) as currency, r::numeric as rate
        from unnest(${rows.map((r) => r.day)}::text[], ${rows.map((r) => r.currency)}::text[],
                    ${rows.map((r) => r.rate)}::text[]) as t(d, c, r)
      ), ecb as (
        select day, currency, rate from given
        union select distinct day, 'EUR'::char(3), 1::numeric from given
      ), wrote as (
        insert into fx_rates (day, base, quote, rate)
        select b.day, b.currency, q.currency, round(q.rate / b.rate, 8)
        from ecb b join ecb q on q.day = b.day and q.currency <> b.currency
        where q.currency in ${sql.in([...QUOTES])}
        on conflict (day, base, quote) do update set rate = excluded.rate
          where fx_rates.rate is distinct from excluded.rate
        returning 1
      )
      select count(*)::int as n from wrote`,
    ([row]) => row?.n ?? 0
  )
}

/**
 * The nightly fill: the ECB's last 90 days into `fx_rates`. A table no tenant owns, so outside any workspace's scope;
 * how many rows were new or changed.
 */
export const fill = Effect.gen(function*() {
  const days = yield* (yield* ReferenceRates).recent
  const db = yield* Db
  return yield* db.unscopedForCron((sql) => fillIn(sql, days))
}).pipe(Effect.withSpan("Fx.fill"))
