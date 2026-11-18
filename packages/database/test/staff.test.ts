import { PgClient } from "@effect/sql-pg"
import { mintId, UserId, WorkspaceId } from "@insyte/domain/Ids"
import { CurrentPrincipal, type Principal } from "@insyte/domain/Principal"
import { CurrentUser, type SessionUser } from "@insyte/domain/Session"
import { Cause, Effect, Exit, Layer, Redacted, Schema } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { Db, DbLive } from "../src/Db.ts"

/*
 * The staff admin in the database (M18, 0107), as `insyte_app`: the team (`staff`) and a session looking along
 * (`staff_viewer`) are held by row level security and by a read-only transaction, whatever the code above asks.
 * A session is only begun where the owner consented; the team's audit is the team's; the sealed secrets are closed to
 * both; and a `staff_viewer` reads only the workspace it was started for, and writes nothing.
 */
const APP_URL = process.env["DATABASE_URL_APP"] ?? "postgres://insyte_app:insyte_app_local@localhost:55443/insyte"
const run = <A, E>(effect: Effect.Effect<A, E, Db>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(DbLive.pipe(Layer.provide(PgClient.layer({ url: Redacted.make(APP_URL) })))))
  )
const exitOf = <A, E>(effect: Effect.Effect<A, E, Db>) => run(Effect.exit(effect))
const refusalOf = (exit: Exit.Exit<unknown, unknown>) => Exit.isSuccess(exit) ? "accepted" : Cause.pretty(exit.cause)

const runId = Date.now().toString(36)
const STAFF = `staff-${runId}@example.com`
const person = (tag: string): SessionUser => ({
  id: Schema.decodeSync(UserId)(mintId("usr")),
  email: `staffdb-${runId}-${tag}@example.com`,
  name: `Staffdb ${runId} ${tag}`,
  emailVerified: true,
  image: null,
  twoFactorEnabled: false
})
const alice = person("a")
const bob = person("b")
const wsA = Schema.decodeSync(WorkspaceId)(mintId("ws"))
const wsB = Schema.decodeSync(WorkspaceId)(mintId("ws"))

const owner = (workspaceId: WorkspaceId, user: SessionUser, id: string): Principal => ({
  kind: "member",
  id,
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

const viewer = (workspaceId: WorkspaceId, sessionId: string): Principal => ({
  ...owner(workspaceId, alice, sessionId),
  kind: "staff_viewer",
  userId: null as never,
  role: { ...owner(workspaceId, alice, sessionId).role, id: "staff_viewer", label: "Insyte-support" }
})

const found = (user: SessionUser, workspaceId: WorkspaceId) =>
  Effect.gen(function*() {
    const db = yield* Db
    yield* db.routing((sql) =>
      sql`insert into auth."user" (id, name, email, email_verified, created_at, updated_at)
          values (${user.id}, ${user.name}, ${user.email}, true, now(), now())`
    )
    const memberId = mintId("mem")
    yield* db.asNewcomerIn(workspaceId)((sql) =>
      Effect.gen(function*() {
        yield* sql`insert into workspaces (id, name, slug) values (${workspaceId}, ${user.name}, ${`s-${runId}-${
          user.email.split("-").at(-1)!.split("@")[0]
        }`})`
        yield* sql`insert into roles (id, workspace_id, label, kind, levels) values ('owner', ${workspaceId}, 'Eigenaar', 'system', '{}')`
        yield* sql`insert into members (id, workspace_id, user_id, role_id) values (${memberId}, ${workspaceId}, ${user.id}, 'owner')`
      })
    ).pipe(Effect.provideService(CurrentUser, user))
    return memberId
  })

/** A session begun as the team, in a workspace. */
const begin = (workspaceId: WorkspaceId, id: string) =>
  Effect.flatMap(
    Effect.service(Db),
    (db) =>
      db.recordAsStaff(STAFF, workspaceId)((sql) =>
        sql`insert into staff_sessions (id, workspace_id, staff_email, reason, expires_at)
            values (${id}, ${workspaceId}, ${STAFF}, 'Ticket', now() + interval '30 minutes')`
      )
  )

const members: Record<string, string> = {}
const asOwnerOf = (workspaceId: WorkspaceId, user: SessionUser) =>
  Effect.provideService(CurrentPrincipal, owner(workspaceId, user, members[workspaceId]!))

describe("the staff admin's tables", () => {
  let session: string

  beforeAll(async () => {
    members[wsA] = await run(found(alice, wsA))
    members[wsB] = await run(found(bob, wsB))
    // A's owner consents; B's does not.
    await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.scoped((sql) =>
            sql`update workspaces set support_access_until = now() + interval '7 days' where id = ${wsA}`
          )
      ).pipe(asOwnerOf(wsA, alice))
    )
  })

  it("begins a session only where the owner consented, and only as the team", async () => {
    session = mintId("sts")
    expect(refusalOf(await exitOf(begin(wsA, session)))).toBe("accepted")
    expect(refusalOf(await exitOf(begin(wsB, mintId("sts"))))).toContain("staff_sessions_begun")
    // A member cannot write one, even in their own consenting workspace.
    const forged = await exitOf(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.scoped((sql) =>
            sql`insert into staff_sessions (id, workspace_id, staff_email, reason, expires_at)
              values (${mintId("sts")}, ${wsA}, ${STAFF}, 'Ticket', now() + interval '30 minutes')`
          )
      ).pipe(asOwnerOf(wsA, alice))
    )
    expect(refusalOf(forged)).toContain("staff_sessions_begun")
  })

  it("never lets a session last past an hour", async () => {
    const long = await exitOf(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.recordAsStaff(STAFF, wsA)((sql) =>
            sql`insert into staff_sessions (id, workspace_id, staff_email, reason, expires_at)
              values (${mintId("sts")}, ${wsA}, ${STAFF}, 'Ticket', now() + interval '61 minutes')`
          )
      )
    )
    expect(refusalOf(long)).toContain("check constraint")
  })

  it("lets a member see that a session is on, and not end or change it", async () => {
    const [seen] = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) => db.scoped((sql) => sql<{ id: string }>`select id from staff_sessions where id = ${session}`)
      ).pipe(
        asOwnerOf(wsA, alice)
      )
    )
    expect(seen?.id).toBe(session)
    const ended = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) => db.scoped((sql) => sql`update staff_sessions set ended_at = now() where id = ${session} returning id`)
      ).pipe(
        asOwnerOf(wsA, alice)
      )
    )
    expect(ended).toEqual([])
  })

  it("keeps the team's audit to the team: a member neither reads nor writes it", async () => {
    await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.recordAsStaff(STAFF, wsA)((sql) =>
            sql`insert into staff_audit (id, staff_email, action, workspace_id, outcome)
              values (${mintId("sta")}, ${STAFF}, 'workspace.health', ${wsA}, 'ok')`
          )
      )
    )
    const read = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) => db.scoped((sql) => sql`select id from staff_audit where workspace_id = ${wsA}`)
      ).pipe(asOwnerOf(wsA, alice))
    )
    expect(read).toEqual([])
    const write = await exitOf(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.scoped((sql) =>
            sql`insert into staff_audit (id, staff_email, action, workspace_id, outcome)
              values (${mintId("sta")}, 'x@example.com', 'workspace.health', ${wsA}, 'ok')`
          )
      ).pipe(asOwnerOf(wsA, alice))
    )
    expect(refusalOf(write)).toContain("row-level security")
    const theTeam = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) => db.asStaff(STAFF, null)((sql) => sql`select id from staff_audit where workspace_id = ${wsA}`)
      )
    )
    expect(theTeam.length).toBeGreaterThan(0)
  })

  it("reads as the team in a read-only transaction", async () => {
    const write = await exitOf(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.asStaff(STAFF, wsA)((sql) =>
            sql`insert into staff_audit (id, staff_email, action, outcome) values (${
              mintId("sta")
            }, ${STAFF}, 'workspace.health', 'ok')`
          )
      )
    )
    expect(refusalOf(write)).toContain("read-only transaction")
  })

  it("finds workspaces for the team only", async () => {
    const asTeam = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.asStaff(STAFF, null)((sql) => sql<{ id: string }>`select id from staff_find_workspaces(${alice.name})`)
      )
    )
    expect(asTeam.map((r) => r.id)).toEqual([wsA])
    const asMember = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) => db.scoped((sql) => sql<{ id: string }>`select id from staff_find_workspaces(${bob.name})`)
      ).pipe(
        asOwnerOf(wsA, alice)
      )
    )
    expect(asMember).toEqual([])
  })

  describe("a session looking along (staff_viewer)", () => {
    const asViewer = Effect.provideService(CurrentPrincipal, viewer(wsA, "sts_viewer"))

    it("reads only the workspace it was started for", async () => {
      const rows = await run(
        Effect.flatMap(
          Effect.service(Db),
          (db) => db.scoped((sql) => sql<{ workspaceId: string }>`select workspace_id as "workspaceId" from members`)
        ).pipe(asViewer)
      )
      expect(rows.length).toBeGreaterThan(0)
      expect(new Set(rows.map((r) => r.workspaceId))).toEqual(new Set([wsA]))
      const other = await run(
        Effect.flatMap(
          Effect.service(Db),
          (db) => db.scoped((sql) => sql`select id from members where workspace_id = ${wsB}`)
        ).pipe(asViewer)
      )
      expect(other).toEqual([])
    })

    it("writes nothing: its transaction is read-only", async () => {
      const write = await exitOf(
        Effect.flatMap(
          Effect.service(Db),
          (db) =>
            db.scoped((sql) => sql`insert into teams (id, workspace_id, name) values (${mintId("team")}, ${wsA}, 'X')`)
        ).pipe(
          asViewer
        )
      )
      expect(refusalOf(write)).toContain("read-only transaction")
    })

    it("and the sealed secrets are closed to it", async () => {
      const policies = await run(
        Effect.flatMap(
          Effect.service(Db),
          (db) =>
            db.routing((sql) =>
              sql<{ tablename: string }>`select tablename from pg_policies
              where policyname like '%_no_staff' and permissive = 'RESTRICTIVE' order by tablename`
            )
        )
      )
      expect(policies.map((p) => p.tablename)).toEqual([
        "connection_credentials",
        "oauth_states",
        "supplier_integrations",
        "webhook_endpoints"
      ])
    })
  })
})
