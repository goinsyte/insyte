import { PgClient } from "@effect/sql-pg"
import { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentPrincipal, CurrentWorkspace, type Principal } from "@insyte/domain/Principal"
import { Effect, Layer, Redacted, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { afterAll, describe, expect, it } from "vitest"
import { Db, DbLive } from "../src/Db.ts"

/*
 * Against the compose database (`bun run db:up && bun run db:migrate --local`), connected as `insyte_app`: the role the
 * Workers use, which owns nothing and bypasses nothing. CI starts the same container before the tests.
 */
const APP_URL = process.env["DATABASE_URL_APP"] ?? "postgres://insyte_app:insyte_app_local@localhost:55443/insyte"

const run = <A, E>(effect: Effect.Effect<A, E, Db>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(DbLive.pipe(Layer.provide(PgClient.layer({ url: Redacted.make(APP_URL) })))))
  )

const wsA = Schema.decodeSync(WorkspaceId)("ws_01jc5x3k8m9n0p1q2r3s4t5vaa")
const wsB = Schema.decodeSync(WorkspaceId)("ws_01jc5x3k8m9n0p1q2r3s4t5vbb")
const member = (workspaceId: typeof wsA): Principal => ({
  kind: "member",
  id: "mem_test",
  userId: null,
  workspaceId,
  partnerId: null,
  role: {
    id: "owner",
    label: "Eigenaar",
    version: 1,
    levels: {} as Principal["role"]["levels"],
    specials: {} as Principal["role"]["specials"],
    refundLimit: null,
    stores: "all"
  },
  storeScope: null
})

/** This run's rows only, by id prefix, so a run never counts another's leftovers. */
const runId = `t${Date.now().toString(36)}`
const insertOutbox = (id: string, workspaceId: string) => (sql: SqlClient.SqlClient) =>
  sql`insert into outbox (id, workspace_id, event, payload) values (${`${runId}_${id}`}, ${workspaceId}, 'test', '{}')`
const countOutbox = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ n: string }>`select count(*)::text as n from outbox where id like ${`${runId}_%`}`,
    (rows) => Number(rows[0]!.n)
  )
const asMemberOf = (workspaceId: typeof wsA) => Effect.provideService(CurrentPrincipal, member(workspaceId))

/** The way the app would: inside the workspace's scope. Forced RLS hides the rows from everyone else, the owner too. */
afterAll(() =>
  run(
    Effect.flatMap(
      Effect.service(Db),
      (db) => db.scoped((sql) => sql`delete from outbox where id like ${`${runId}_%`}`)
    ).pipe(asMemberOf(wsA))
  )
)

describe("Db", () => {
  it("connects as insyte_app, which cannot bypass row level security", async () => {
    const [role] = await run(
      Effect.flatMap(Effect.service(Db), (db) =>
        db.routing((sql) =>
          sql<{ user: string; bypass: boolean }>`
          select current_user as user, rolbypassrls as bypass from pg_roles where rolname = current_user`
        ))
    )
    expect(role).toEqual({ user: "insyte_app", bypass: false })
  })

  it("lets a member write and read their own workspace's rows", async () => {
    const seen = await run(
      Effect.gen(function*() {
        const db = yield* Db
        yield* db.scoped(insertOutbox("a", wsA))
        return yield* db.scoped(countOutbox)
      }).pipe(asMemberOf(wsA))
    )
    expect(seen).toBe(1)
  })

  it("shows another workspace nothing", async () => {
    expect(await run(Effect.flatMap(Effect.service(Db), (db) => db.scoped(countOutbox)).pipe(asMemberOf(wsB)))).toBe(0)
  })

  it("refuses a row for another workspace than the request's", async () => {
    const exit = await run(
      Effect.flatMap(Effect.service(Db), (db) => db.scoped(insertOutbox("x", wsB))).pipe(asMemberOf(wsA), Effect.exit)
    )
    expect(exit._tag).toBe("Failure")
  })

  it("scopes background work to the workspace it resolved", async () => {
    const seen = await run(
      Effect.flatMap(Effect.service(Db), (db) => db.scopedFor(countOutbox)).pipe(
        Effect.provideService(CurrentWorkspace, { id: wsA })
      )
    )
    expect(seen).toBe(1)
  })

  it("shows tenant rows to nobody outside a scoped transaction", async () => {
    expect(await run(Effect.flatMap(Effect.service(Db), (db) => db.routing(countOutbox)))).toBe(0)
  })
})
