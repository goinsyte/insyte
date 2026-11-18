import { PgClient } from "@effect/sql-pg"
import { mintId, UserId, WorkspaceId } from "@insyte/domain/Ids"
import { CurrentPrincipal, CurrentWorkspace, type Principal } from "@insyte/domain/Principal"
import { CurrentUser, type SessionUser } from "@insyte/domain/Session"
import { Cause, Effect, Exit, Layer, Redacted, Schema } from "effect"
import type { SqlClient } from "effect/sql"
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

const viewerSees = (id: string) =>
  run(
    Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => sql<{ id: string }>`select id from members`)).pipe(
      Effect.provideService(CurrentPrincipal, viewer(wsA, id))
    )
  )
const setConsent = (until: string | null) =>
  run(
    Effect.flatMap(
      Effect.service(Db),
      (db) =>
        db.scoped((sql) =>
          sql`update workspaces set support_access_until = ${until === null ? null : sql`now() + ${until}::interval`}
              where id = ${wsA}`
        )
    ).pipe(asOwnerOf(wsA, alice))
  )
const writingAsTeam = <A, E>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E>) =>
  Effect.flatMap(Effect.service(Db), (db) => db.recordAsStaff(STAFF, wsA)(f))

describe("the staff admin's tables", () => {
  let session: string

  const asViewer = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(effect, CurrentPrincipal, viewer(wsA, session))
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

    it("reads nothing, in SQL, for a session that never was, has ended or is past its hour (0107)", async () => {
      expect((await viewerSees(session)).length).toBeGreaterThan(0)
      expect(await viewerSees(mintId("sts"))).toEqual([])
      const ended = mintId("sts")
      await run(begin(wsA, ended))
      expect((await viewerSees(ended)).length).toBeGreaterThan(0)
      await run(
        Effect.flatMap(
          Effect.service(Db),
          (db) =>
            db.recordAsStaff(STAFF, wsA)((sql) => sql`update staff_sessions set ended_at = now() where id = ${ended}`)
        )
      )
      expect(await viewerSees(ended)).toEqual([])
      const past = mintId("sts")
      await run(
        Effect.flatMap(
          Effect.service(Db),
          (db) =>
            db.recordAsStaff(STAFF, wsA)((sql) =>
              sql`insert into staff_sessions (id, workspace_id, staff_email, reason, started_at, expires_at)
                  values (${past}, ${wsA}, ${STAFF}, 'Ticket', now() - interval '2 hours', now() - interval '1 hour')`
            )
        )
      )
      expect(await viewerSees(past)).toEqual([])
      // A session of A, read as though in B: nothing either.
      const inB = await run(
        Effect.flatMap(Effect.service(Db), (db) => db.scoped((sql) => sql`select id from members`)).pipe(
          Effect.provideService(CurrentPrincipal, viewer(wsB, session))
        )
      )
      expect(inB).toEqual([])
    })

    it("reads nothing, in SQL, once the owner's consent is withdrawn or has run out (0107)", async () => {
      await setConsent(null)
      expect(await viewerSees(session)).toEqual([])
      await setConsent("-1 minute")
      expect(await viewerSees(session)).toEqual([])
      await setConsent("7 days")
      expect((await viewerSees(session)).length).toBeGreaterThan(0)
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

  describe("the team, held to its own rows (0107)", () => {
    it("changes nothing of the workspace's own, not its name, its consent or its people", async () => {
      expect(
        await run(writingAsTeam((sql) => sql`update workspaces set name = 'pwned' where id = ${wsA} returning id`))
      )
        .toEqual([])
      expect(
        await run(
          writingAsTeam((sql) =>
            sql`update workspaces set support_access_until = now() + interval '365 days' where id = ${wsA} returning id`
          )
        )
      ).toEqual([])
      expect(await run(writingAsTeam((sql) => sql`delete from members where workspace_id = ${wsA} returning id`)))
        .toEqual([])
      const team = await exitOf(
        writingAsTeam((sql) => sql`insert into teams (id, workspace_id, name) values (${mintId("team")}, ${wsA}, 'X')`)
      )
      expect(refusalOf(team)).toContain("teams_staff_insert")
      const [ws] = await run(
        Effect.flatMap(
          Effect.service(Db),
          (db) =>
            db.scoped((sql) =>
              sql<{ name: string; days: number }>`
                select name, extract(day from support_access_until - now())::int as days from workspaces
                where id = ${wsA}`
            )
        ).pipe(asOwnerOf(wsA, alice))
      )
      expect(ws).toEqual({ name: alice.name, days: 6 })
    })

    it("writes nothing to the tables without row level security, which their own writers still write (0109)", async () => {
      // Each statement finds no row: the refusal is the trigger's, before any row is looked at.
      const writes = {
        user: (sql: SqlClient.SqlClient) => sql`update auth."user" set name = 'pwned' where id = ${alice.id}`,
        account: (sql: SqlClient.SqlClient) => sql`delete from auth.account where user_id = ${alice.id}`,
        session: (sql: SqlClient.SqlClient) => sql`delete from auth.session where user_id = ${alice.id}`,
        twoFactor: (sql: SqlClient.SqlClient) => sql`delete from auth.two_factor where user_id = ${alice.id}`,
        verification: (sql: SqlClient.SqlClient) => sql`delete from auth.verification where identifier = ${STAFF}`,
        rates: (sql: SqlClient.SqlClient) => sql`delete from fx_rates where false`,
        sinks: (sql: SqlClient.SqlClient) => sql`delete from outbox_sinks where outbox_id = ${wsA}`,
        migrations: (sql: SqlClient.SqlClient) => sql`delete from migrations where false`
      }
      for (const [table, write] of Object.entries(writes)) {
        expect(refusalOf(await exitOf(writingAsTeam(write))), table).toContain("support team writes nothing here")
      }
      // Not staff (better-auth's own writes, the relay's claims, the rates' fill): as before.
      for (const write of Object.values(writes)) {
        expect(Exit.isSuccess(await exitOf(Effect.flatMap(Effect.service(Db), (db) => db.routing(write))))).toBe(true)
      }
    })

    it("writes only its sessions, its audit, the Logboek's support lines and the realtime nudge", async () => {
      const logbook = (line: { section?: string; action?: string; by?: string; said?: string }) =>
        exitOf(
          writingAsTeam((sql) =>
            sql`insert into audit_events
                  (id, workspace_id, actor_kind, actor_id, action, subject_type, subject_id, section, diff)
                values (${mintId("aud")}, ${wsA}, 'insyte', ${line.by ?? session}, ${line.action ?? "support.read"},
                        'support', ${line.by ?? session}, ${line.section ?? "support"},
                        ${JSON.stringify({ said: line.said ?? "Bekeken: Team" })}::jsonb)`
          )
        )
      expect(refusalOf(await logbook({}))).toBe("accepted")
      expect(
        refusalOf(
          await logbook({ action: "support.status_viewed", by: "support", said: "Insyte-support bekeek de status" })
        )
      )
        .toBe("accepted")
      expect(refusalOf(await logbook({ section: "team" }))).toContain("audit_events_staff_insert")
      // Not a line the support slice writes: another action, another session's name, or words of its own.
      expect(refusalOf(await logbook({ action: "support.anything" }))).toContain("audit_events_staff_insert")
      expect(refusalOf(await logbook({ by: mintId("sts") }))).toContain("audit_events_staff_insert")
      expect(refusalOf(await logbook({ said: "Eigenaar heeft alles goedgekeurd" }))).toContain(
        "audit_events_staff_insert"
      )
      // An end the session did not have: only the transaction that ends it says so.
      expect(refusalOf(await logbook({ action: "support.session_ended", said: "Meekijken beëindigd" }))).toContain(
        "audit_events_staff_insert"
      )
      const nudge = (event: string, payload: Record<string, unknown>) =>
        exitOf(
          writingAsTeam((sql) =>
            sql`insert into outbox (id, workspace_id, event, payload)
                values (${mintId("obx")}, ${wsA}, ${event}, ${JSON.stringify(payload)}::jsonb)`
          )
        )
      const support = { workspaceId: wsA, kind: "support", ids: [session] }
      expect(refusalOf(await nudge("records.changed", support))).toBe("accepted")
      expect(refusalOf(await nudge("mail.send", support))).toContain("outbox_staff_insert")
      // Not another workspace's room, nor another kind of change.
      expect(refusalOf(await nudge("records.changed", { ...support, workspaceId: wsB }))).toContain(
        "outbox_staff_insert"
      )
      expect(refusalOf(await nudge("records.changed", { ...support, kind: "orders" }))).toContain(
        "outbox_staff_insert"
      )
      const forged = await exitOf(
        writingAsTeam((sql) =>
          sql`insert into staff_audit (id, staff_email, action, workspace_id, outcome)
            values (${mintId("sta")}, 'someone-else@example.com', 'workspace.health', ${wsA}, 'ok')`
        )
      )
      expect(refusalOf(forged)).toContain("staff_audit_staff_insert")
    })

    it("ends a session of its own and changes nothing else of it", async () => {
      const reason = await exitOf(
        writingAsTeam((sql) => sql`update staff_sessions set reason = 'x' where id = ${session}`)
      )
      expect(refusalOf(reason)).toContain("permission denied for table staff_sessions")
      const longer = await exitOf(
        writingAsTeam((sql) =>
          sql`update staff_sessions set expires_at = now() + interval '1 day' where id = ${session}`
        )
      )
      expect(refusalOf(longer)).toContain("permission denied for table staff_sessions")
      const someoneElses = await run(
        Effect.flatMap(
          Effect.service(Db),
          (db) =>
            db.recordAsStaff("second@example.com", wsA)((sql) =>
              sql`update staff_sessions set ended_at = now() where id = ${session} returning id`
            )
        )
      )
      expect(someoneElses).toEqual([])
    })

    it("ends a session once, and never opens it again", async () => {
      const once = mintId("sts")
      await run(begin(wsA, once))
      const end = () =>
        run(writingAsTeam((sql) => sql`update staff_sessions set ended_at = now() where id = ${once} returning id`))
      expect(await end()).toEqual([{ id: once }])
      expect(await end()).toEqual([])
      const reopened = await run(
        writingAsTeam((sql) => sql`update staff_sessions set ended_at = null where id = ${once} returning id`)
      )
      expect(reopened).toEqual([])
      // Nor is a live one "ended" with no moment.
      const live = mintId("sts")
      await run(begin(wsA, live))
      const blank = await exitOf(
        writingAsTeam((sql) => sql`update staff_sessions set ended_at = null where id = ${live} returning id`)
      )
      expect(refusalOf(blank)).toContain("staff_sessions_staff_update")
    })

    it("cannot wipe the Logboek through the purged suppliers' redaction (0106), which a member's request may", async () => {
      const asStaff = await exitOf(
        writingAsTeam((sql) => sql`select redact_purged_supplier_audit(array[${mintId("sup")}])`)
      )
      expect(refusalOf(asStaff)).toContain("redact_purged_supplier_audit: not for Insyte's support team")
      const asOwner = await exitOf(
        Effect.flatMap(
          Effect.service(Db),
          (db) => db.scoped((sql) => sql`select redact_purged_supplier_audit(array[${mintId("sup")}])`)
        ).pipe(asOwnerOf(wsA, alice))
      )
      expect(refusalOf(asOwner)).toBe("accepted")
    })

    it("has the guard on every table with row level security", async () => {
      const rows = await run(
        Effect.flatMap(Effect.service(Db), (db) =>
          db.routing((sql) =>
            sql<{ table: string; guards: number }>`
              select c.relname as table,
                     (select count(*)::int from pg_policy p where p.polrelid = c.oid and p.polname in
                        (c.relname || '_staff_select', c.relname || '_staff_insert', c.relname || '_staff_update',
                         c.relname || '_staff_delete')) as guards
              from pg_class c
              where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relrowsecurity
                and not c.relispartition
              order by 1`
          ))
      )
      expect(rows.length).toBeGreaterThan(100)
      expect(rows.filter((r) => r.guards !== 4).map((r) => r.table)).toEqual([])
    })
  })

  it("forgets what it searched for once the workspace it found is purged (0107)", async () => {
    const carol = person("c")
    const wsC = Schema.decodeSync(WorkspaceId)(mintId("ws"))
    members[wsC] = await run(found(carol, wsC))
    const line = (action: string, workspaceId: string | null, detail: string) =>
      run(
        Effect.flatMap(
          Effect.service(Db),
          (db) =>
            db.recordAsStaff(STAFF, null)((sql) =>
              sql`insert into staff_audit (id, staff_email, action, workspace_id, outcome, detail)
                  values (${mintId("sta")}, ${STAFF}, ${action}, ${workspaceId}, 'ok', ${detail})`
            )
        )
      )
    const needle = carol.name.slice(-12).toUpperCase()
    await line("workspaces.search", null, needle)
    await line("workspaces.search", null, wsC)
    const order = mintId("ord")
    await line("session.read", wsC, order)
    await line("workspaces.search", null, `elsewhere-${runId}`)
    await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.scopedFor((sql) =>
            Effect.gen(function*() {
              yield* sql`insert into gdpr_requests (id, workspace_id, kind, source, payload, due_at, state, attempts)
                         values (${
                mintId("gdpr")
              }, ${wsC}, 'workspace_delete', 'operator', '{}', now() - interval '1 minute',
                                 'purging', 1)`
              yield* sql`select purge_workspace(${wsC})`
            })
          )
      ).pipe(Effect.provideService(CurrentWorkspace, { id: wsC }))
    )
    const kept = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.asStaff(STAFF, null)((sql) =>
            sql<{ detail: string }>`
              select detail from staff_audit
              where detail in (${needle}, ${wsC}, ${order}, ${`elsewhere-${runId}`})
                 or (workspace_id = ${wsC})
                 or (detail = '[verwijderd]' and at > now() - interval '1 minute')
              order by detail`
          )
      )
    )
    expect(kept.map((r) => r.detail).filter((d) => d !== "[verwijderd]")).toEqual([`elsewhere-${runId}`])
    expect(kept.filter((r) => r.detail === "[verwijderd]").length).toBeGreaterThanOrEqual(3)
  })
})
