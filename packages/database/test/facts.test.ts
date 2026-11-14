import { PgClient } from "@effect/sql-pg"
import { mintId, WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Deferred, Effect, Fiber, Layer, Redacted, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { describe, expect, it } from "vitest"
import { Db, DbLive } from "../src/Db.ts"

/*
 * The facts kept inline by a trigger (0064 tickets, 0078 disputes), with two transactions at once and with a workspace
 * whose timezone changes. Each writer recomputes the days it touched by deleting and inserting them: two writers on
 * the same day take turns, so neither write fails on the facts' grain and the later one counts both. Against the
 * compose database as `insyte_app`.
 */
const APP_URL = process.env["DATABASE_URL_APP"] ?? "postgres://insyte_app:insyte_app_local@localhost:55443/insyte"
const run = <A, E>(effect: Effect.Effect<A, E, Db>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(DbLive.pipe(Layer.provide(PgClient.layer({ url: Redacted.make(APP_URL) })))))
  )

const runId = Date.now().toString(36)
const domain = (id: string) => `f-${runId}-${id.slice(-8).toLowerCase()}`

/** A workspace with two stores, one without a zone of its own and one in UTC; the workspace in `tz`. */
const workspace = (tz: string) => {
  const ws = Schema.decodeSync(WorkspaceId)(mintId("ws"))
  const loose = mintId("sto")
  const zoned = mintId("sto")
  return Effect.gen(function*() {
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        yield* sql`insert into workspaces (id, name, slug, timezone) values (${ws}, 'Merk', ${`f-${runId}-${
          ws.slice(-6)
        }`}, ${tz})`
        const conn = mintId("con")
        yield* sql`insert into connections (id, workspace_id, provider, account_ref) values (${conn}, ${ws}, 'shopify', ${conn})`
        yield* sql`insert into stores (id, workspace_id, connection_id, shop_domain, name, timezone)
                   values (${loose}, ${ws}, ${conn}, ${`${domain(loose)}.myshopify.com`}, 'Zonder zone', null),
                          (${zoned}, ${ws}, ${conn}, ${`${domain(zoned)}.myshopify.com`}, 'In UTC', 'UTC')`
      })
    ).pipe(Effect.provideService(CurrentWorkspace, { id: ws }))
    return { ws, loose, zoned }
  })
}

const chargeback = (sql: SqlClient.SqlClient, ws: string, store: string | null, at: string) =>
  sql`insert into chargebacks (id, workspace_id, store_id, provider, case_number, customer_name, amount_minor, currency,
                               reason, reason_code, deadline_at, opened_at)
      values (${mintId("cbk")}, ${ws}, ${store}, 'stripe', ${mintId("case").slice(-12)}, 'Klant', 2500, 'EUR',
              'item_not_received', 'fraudulent', ${at}::timestamptz + interval '7 days', ${at}::timestamptz)`

const ticket = (sql: SqlClient.SqlClient, ws: string, n: number, at: string) =>
  sql`insert into tickets (id, workspace_id, number, title, created_by, created_at)
      values (${mintId("tkt")}, ${ws}, ${n}, 'Waar is mijn pakket?', 'system', ${at}::timestamptz)`

/**
 * Two writes on one day at once: A writes and holds its transaction open; B writes the same day meanwhile and has to
 * wait for A; then A commits. Without turns, B's insert would fail on the grain A's uncommitted facts hold.
 */
const together = (
  ws: WorkspaceId,
  write: (sql: SqlClient.SqlClient, which: 1 | 2) => Effect.Effect<unknown, unknown>
) =>
  Effect.gen(function*() {
    const db = yield* Db
    const written = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const a = yield* Effect.forkChild(
      db.scopedFor((sql) =>
        Effect.gen(function*() {
          yield* write(sql, 1)
          yield* Deferred.succeed(written, undefined)
          yield* Deferred.await(release)
        })
      ).pipe(Effect.provideService(CurrentWorkspace, { id: ws }))
    )
    yield* Deferred.await(written)
    const b = yield* Effect.forkChild(
      db.scopedFor((sql) => write(sql, 2)).pipe(Effect.provideService(CurrentWorkspace, { id: ws }))
    )
    yield* Effect.sleep("300 millis")
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(a)
    yield* Fiber.join(b)
  })

const read = <A extends object>(
  ws: WorkspaceId,
  f: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<A>, unknown>
) =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedFor(f).pipe(Effect.provideService(CurrentWorkspace, { id: ws })))

describe("facts kept by a trigger", () => {
  it("counts two cases opened on one store-day at once, neither write failing", () =>
    run(Effect.gen(function*() {
      const { ws, zoned } = yield* workspace("Europe/Amsterdam")
      yield* together(ws, (sql) => chargeback(sql, ws, zoned, "2026-03-10T12:00:00Z"))
      // And two cases without a store on the workspace's day.
      yield* together(ws, (sql) => chargeback(sql, ws, null, "2026-03-10T12:00:00Z"))
      const rows = yield* read<{ store_id: string | null; day: string; opened: number }>(ws, (sql) =>
        sql`select store_id, to_char(day, 'YYYY-MM-DD') as day, opened from fact_disputes_day
            where workspace_id = ${ws} order by store_id nulls last`)
      expect(rows).toEqual([
        { store_id: zoned, day: "2026-03-10", opened: 2 },
        { store_id: null, day: "2026-03-10", opened: 2 }
      ])
    })))

  it("counts two tickets that came in on one day at once, neither write failing", () =>
    run(Effect.gen(function*() {
      const { ws } = yield* workspace("Europe/Amsterdam")
      yield* together(ws, (sql, which) => ticket(sql, ws, which, "2026-03-10T12:00:00Z"))
      const rows = yield* read<{ day: string; created: number }>(ws, (sql) =>
        sql`select to_char(day, 'YYYY-MM-DD') as day, created from fact_tickets_day where workspace_id = ${ws}`)
      expect(rows).toEqual([{ day: "2026-03-10", created: 2 }])
    })))

  it("moves what counts on the workspace's days when its timezone changes", () =>
    run(Effect.gen(function*() {
      const { ws, loose, zoned } = yield* workspace("UTC")
      const db = yield* Db
      const scoped = <A, E>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E>) =>
        db.scopedFor(f).pipe(Effect.provideService(CurrentWorkspace, { id: ws }))
      // 23:30 UTC on the 10th is 00:30 on the 11th in Amsterdam.
      const at = "2026-03-10T23:30:00Z"
      yield* scoped((sql) =>
        Effect.gen(function*() {
          yield* chargeback(sql, ws, null, at)
          yield* chargeback(sql, ws, loose, at)
          yield* chargeback(sql, ws, zoned, at)
          yield* ticket(sql, ws, 1, at)
          yield* sql`delete from fact_dirty_days where workspace_id = ${ws}`
        })
      )
      yield* scoped((sql) => sql`update workspaces set timezone = 'Europe/Amsterdam' where id = ${ws}`)

      // The case without a store and the ticket moved, on the spot, without a copy left on the old day.
      const disputes = yield* read<{ day: string; opened: number }>(ws, (sql) =>
        sql`select to_char(day, 'YYYY-MM-DD') as day, opened from fact_disputes_day
            where workspace_id = ${ws} and store_id is null`)
      expect(disputes).toEqual([{ day: "2026-03-11", opened: 1 }])
      const tickets = yield* read<{ day: string; created: number }>(ws, (sql) =>
        sql`select to_char(day, 'YYYY-MM-DD') as day, created from fact_tickets_day where workspace_id = ${ws}`)
      expect(tickets).toEqual([{ day: "2026-03-11", created: 1 }])
      // The store without a zone of its own is marked for the drain on its old and its new day; the zoned one is not.
      const marked = yield* read<{ store_id: string; day: string }>(ws, (sql) =>
        sql`select store_id, to_char(day, 'YYYY-MM-DD') as day from fact_dirty_days
            where workspace_id = ${ws} order by day`)
      expect(marked).toEqual([
        { store_id: loose, day: "2026-03-10" },
        { store_id: loose, day: "2026-03-11" }
      ])
    })))
})
