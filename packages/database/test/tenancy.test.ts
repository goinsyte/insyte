import { PgClient } from "@effect/sql-pg"
import { mintId, UserId, WorkspaceId } from "@insyte/domain/Ids"
import { CurrentPrincipal, type Principal } from "@insyte/domain/Principal"
import { CurrentUser, type SessionUser } from "@insyte/domain/Session"
import { Effect, Layer, Redacted, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Db, DbLive } from "../src/Db.ts"
import { TENANT_TABLES } from "../src/Tenancy.ts"

/*
 * The tenancy suite (step 3, 06 §2): two people, each with a workspace, and the proof that a member of A reads nothing of
 * B through any table, even with a query that asks for B by name. Against the compose database as `insyte_app`, which
 * owns nothing and bypasses nothing. Plus the catalogue check: every tenant table has its policy, forced, so a table
 * added without the helper fails here.
 */
const APP_URL = process.env["DATABASE_URL_APP"] ?? "postgres://insyte_app:insyte_app_local@localhost:55443/insyte"
const run = <A, E>(effect: Effect.Effect<A, E, Db>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(DbLive.pipe(Layer.provide(PgClient.layer({ url: Redacted.make(APP_URL) })))))
  )

const runId = Date.now().toString(36)
const person = (tag: string): SessionUser => ({
  id: Schema.decodeSync(UserId)(mintId("usr")),
  email: `tenancy-${runId}-${tag}@example.com`,
  name: tag,
  emailVerified: true,
  image: null,
  twoFactorEnabled: false
})
const alice = person("a")
const bob = person("b")
const wsA = Schema.decodeSync(WorkspaceId)(mintId("ws"))
const wsB = Schema.decodeSync(WorkspaceId)(mintId("ws"))

const memberOf = (workspaceId: WorkspaceId, user: SessionUser): Principal => ({
  kind: "member",
  id: "mem_tenancy",
  userId: user.id,
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

/** A person and their workspace, founded as the app founds one: inside the new workspace, as that person. */
const found = (user: SessionUser, workspaceId: WorkspaceId) =>
  Effect.gen(function*() {
    const db = yield* Db
    yield* db.routing((sql) =>
      sql`insert into auth."user" (id, name, email, email_verified, created_at, updated_at)
          values (${user.id}, ${user.name}, ${user.email}, true, now(), now())`
    )
    yield* db.asUserIn(workspaceId)((sql) =>
      Effect.gen(function*() {
        yield* sql`insert into workspaces (id, name, slug) values (${workspaceId}, ${user.name}, ${`t-${runId}-${user.name}`})`
        yield* sql`insert into roles (id, workspace_id, label, kind, levels) values ('owner', ${workspaceId}, 'Eigenaar', 'system', '{}')`
        const memberId = mintId("mem")
        yield* sql`insert into members (id, workspace_id, user_id, role_id) values (${memberId}, ${workspaceId}, ${user.id}, 'owner')`
        yield* sql`insert into teams (id, workspace_id, name) values (${mintId("team")}, ${workspaceId}, 'Team')`
        yield* sql`insert into workspace_counters (workspace_id, kind) values (${workspaceId}, 'order')`
        yield* sql`insert into setup_tasks (workspace_id, task) values (${workspaceId}, 'connect_store')`
        yield* sql`insert into invitations (id, workspace_id, email, token_hash, role_id, invited_by, expires_at)
                   values (${mintId("inv")}, ${workspaceId}, ${`invitee-${user.name}@example.com`}, '\\x00', 'owner',
                           ${memberId}, now() + interval '7 days')`
        const keyId = mintId("key")
        yield* sql`insert into api_keys (id, workspace_id, label, lookup, prefix, secret_hash, access, created_by)
                   values (${keyId}, ${workspaceId}, 'Feed', ${`look${user.name}${runId}`}, 'ins_live_look', '\\x00',
                           '{"kind":"role","roleId":"owner"}', ${memberId})`
        yield* sql`insert into api_requests (workspace_id, key_id, method, path, status, ms)
                   values (${workspaceId}, ${keyId}, 'GET', '/v1/me', 200, 12)`
        yield* sql`insert into access_requests (id, workspace_id, member_id, role_id, area, level)
                   values (${mintId("acr")}, ${workspaceId}, ${memberId}, 'owner', 'team', 3)`
        yield* sql`insert into invite_links (workspace_id, token_hash, role_id, days, expires_at)
                   values (${workspaceId}, '\\x00', 'owner', 7, now() + interval '7 days')`
        yield* sql`insert into outbox (id, workspace_id, event, payload) values (${
          mintId("obx")
        }, ${workspaceId}, 'test', '{}')`
      })
    ).pipe(Effect.provideService(CurrentUser, user))
  })

/** The tables both workspaces have rows in, by the column that names the workspace. */
const POPULATED = [
  ["workspaces", "id"],
  ["roles", "workspace_id"],
  ["members", "workspace_id"],
  ["teams", "workspace_id"],
  ["workspace_counters", "workspace_id"],
  ["setup_tasks", "workspace_id"],
  ["invitations", "workspace_id"],
  ["invite_links", "workspace_id"],
  ["access_requests", "workspace_id"],
  ["api_keys", "workspace_id"],
  ["api_requests", "workspace_id"],
  ["outbox", "workspace_id"]
] as const

describe("tenancy", () => {
  it("founds two workspaces, each as its owner", async () => {
    await run(Effect.andThen(found(alice, wsA), found(bob, wsB)))
  })

  it("shows a member of A nothing of B, through every populated table, even asked for B by name", async () => {
    const seen = await run(
      Effect.gen(function*() {
        const db = yield* Db
        const counts: Record<string, { readonly own: number; readonly other: number }> = {}
        for (const [table, column] of POPULATED) {
          counts[table] = yield* db.scoped((sql) =>
            Effect.map(
              sql<{ own: string; other: string }>`select
                 count(*) filter (where ${sql(column)} = ${wsA})::text as own,
                 count(*) filter (where ${sql(column)} = ${wsB})::text as other
               from ${sql(table)}`,
              ([row]) => ({ own: Number(row!.own), other: Number(row!.other) })
            )
          )
        }
        return counts
      }).pipe(Effect.provideService(CurrentPrincipal, memberOf(wsA, alice)))
    )
    for (const [table] of POPULATED) {
      expect(seen[table], table).toEqual({ own: 1, other: 0 })
    }
  })

  it("lists a person their own memberships and workspaces before any is chosen, and no one else's", async () => {
    const seen = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.forUser((sql) =>
            sql<
              { workspaceId: string }
            >`select m.workspace_id as "workspaceId" from members m join workspaces w on w.id = m.workspace_id
                                       where m.workspace_id in (${wsA}, ${wsB})`
          )
      ).pipe(Effect.provideService(CurrentUser, alice))
    )
    expect(seen.map((r) => r.workspaceId)).toEqual([wsA])
  })

  it("refuses to write a row into another workspace", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.scoped((sql) =>
            sql`insert into teams (id, workspace_id, name) values (${mintId("team")}, ${wsB}, 'Inbreker')`
          )
      ).pipe(
        Effect.provideService(CurrentPrincipal, memberOf(wsA, alice)),
        Effect.provide(DbLive.pipe(Layer.provide(PgClient.layer({ url: Redacted.make(APP_URL) }))))
      )
    )
    expect(exit._tag).toBe("Failure")
  })

  it("has its policy, forced, on every tenant table", async () => {
    const rows = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.routing((sql) =>
            sql<{ table: string; enabled: boolean; forced: boolean; policies: string }>`
            select c.relname as table, c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
                   (select count(*) from pg_policies p where p.tablename = c.relname
                      and p.qual like '%app_workspace_id()%')::text as policies
            from pg_class c where c.relname in ${sql.in([...TENANT_TABLES, "workspaces"])}`
          )
      )
    )
    expect(rows.length).toBe(TENANT_TABLES.length + 1)
    for (const row of rows) {
      expect({ table: row.table, enabled: row.enabled, forced: row.forced }).toEqual({
        table: row.table,
        enabled: true,
        forced: true
      })
      expect(Number(row.policies), row.table).toBeGreaterThan(0)
    }
  })
})
