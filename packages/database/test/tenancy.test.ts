import { PgClient } from "@effect/sql-pg"
import { mintId, UserId, WorkspaceId } from "@insyte/domain/Ids"
import { CurrentPrincipal, CurrentWorkspace, type Principal } from "@insyte/domain/Principal"
import { CurrentUser, type SessionUser } from "@insyte/domain/Session"
import { Cause, Effect, type Exit, Layer, Redacted, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Db, DbLive } from "../src/Db.ts"
import { NEWCOMER_TABLES, TENANT_TABLES } from "../src/Tenancy.ts"

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
/** Alice's second workspace (0096). */
const wsA2 = Schema.decodeSync(WorkspaceId)(mintId("ws"))

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

/**
 * A person and their workspace, founded as the app founds one: inside the new workspace, as a newcomer there (the rows
 * founding writes); then the rest as its member.
 */
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
        yield* sql`insert into workspaces (id, name, slug) values (${workspaceId}, ${user.name}, ${`t-${runId}-${user.name}`})`
        yield* sql`insert into roles (id, workspace_id, label, kind, levels) values ('owner', ${workspaceId}, 'Eigenaar', 'system', '{}')`
        yield* sql`insert into members (id, workspace_id, user_id, role_id) values (${memberId}, ${workspaceId}, ${user.id}, 'owner')`
        yield* sql`insert into workspace_counters (workspace_id, kind) values (${workspaceId}, 'order')`
        yield* sql`insert into outbox (id, workspace_id, event, payload) values (${
          mintId("obx")
        }, ${workspaceId}, 'workspace.created', '{}')`
      })
    ).pipe(Effect.provideService(CurrentUser, user))
    yield* db.asUserIn(workspaceId)((sql) =>
      Effect.gen(function*() {
        yield* sql`insert into teams (id, workspace_id, name) values (${mintId("team")}, ${workspaceId}, 'Team')`
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
      })
    ).pipe(Effect.provideService(CurrentUser, user))
    return memberId
  })

const members: Record<string, string> = {}

/** As one member, by id: the member-own tables (0018) answer to the principal's id. */
const asMember = (id: string, workspaceId: WorkspaceId, user: SessionUser) =>
  Effect.provideService(CurrentPrincipal, { ...memberOf(workspaceId, user), id })

/** Two more people, for the members who are out of a workspace and for a row nobody may write for them. */
const carol = person("c")
const dave = person("d")

/** What refused a statement: the database's message, or how it otherwise ended. */
const refusalOf = (exit: Exit.Exit<unknown, unknown>) =>
  exit._tag === "Success"
    ? "accepted"
    : Cause.pretty(exit.cause).match(/new row violates row-level security policy.*? for table "[^"]+"/)?.[0] ??
      Cause.pretty(exit.cause).slice(0, 300)

/** The ids of some rows, sorted. */
const ids = (rows: ReadonlyArray<{ id: string }>) => rows.map((r) => r.id).toSorted()

/** Row level security refusing a new row in `table`: by its restrictive `policy`, or for want of a permissive one. */
const rlsRefusal = (table: string, policy?: string) =>
  `new row violates row-level security policy ${policy === undefined ? "" : `"${policy}" `}for table "${table}"`

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
    members["a"] = await run(found(alice, wsA))
    members["b"] = await run(found(bob, wsB))
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

  it("keeps a person's other workspace out of the one they work in (0096)", async () => {
    const seen = await run(
      Effect.gen(function*() {
        const db = yield* Db
        yield* db.asNewcomerIn(wsA2)((sql) =>
          Effect.gen(function*() {
            yield* sql`insert into workspaces (id, name, slug) values (${wsA2}, 'a2', ${`t-${runId}-a2`})`
            yield* sql`insert into roles (id, workspace_id, label, kind, levels) values ('owner', ${wsA2}, 'Eigenaar', 'system', '{}')`
            yield* sql`insert into members (id, workspace_id, user_id, role_id) values (${
              mintId("mem")
            }, ${wsA2}, ${alice.id}, 'owner')`
          })
        )
        const mine = (sql: Parameters<Parameters<typeof db.forUser>[0]>[0]) =>
          Effect.all({
            members: sql<{ id: string }>`select workspace_id as id from members order by id`,
            roles: sql<{ id: string }>`select workspace_id as id from roles where id = 'owner' order by id`,
            workspaces: sql<{ id: string }>`select id from workspaces order by id`
          }).pipe(Effect.map((r) => ({
            members: r.members.map((x) => x.id),
            roles: r.roles.map((x) => x.id),
            workspaces: r.workspaces.map((x) => x.id)
          })))
        const before = yield* db.forUser(mine)
        const inA = yield* db.asUserIn(wsA)(mine)
        const inA2 = yield* db.asUserIn(wsA2)(mine)
        return { before, inA, inA2 }
      }).pipe(Effect.provideService(CurrentUser, alice))
    )
    const both = [wsA, wsA2].toSorted()
    expect(seen.before).toEqual({ members: both, roles: both, workspaces: both })
    expect(seen.inA).toEqual({ members: [wsA], roles: [wsA], workspaces: [wsA] })
    expect(seen.inA2).toEqual({ members: [wsA2], roles: [wsA2], workspaces: [wsA2] })
  })

  it("refuses a write into the person's other workspace from inside this one (0096)", async () => {
    const tried = await run(
      Effect.gen(function*() {
        const db = yield* Db
        const inA = <A, E>(f: (sql: Parameters<Parameters<typeof db.forUser>[0]>[0]) => Effect.Effect<A, E>) =>
          db.asUserIn(wsA)(f)
        const roleKept = yield* inA((sql) =>
          sql`update members set role_id = role_id where workspace_id = ${wsA2} returning id`
        )
        const workspaces = yield* inA((sql) => sql`update workspaces set name = 'x' where id = ${wsA2} returning id`)
        const role = yield* Effect.exit(inA((sql) =>
          sql`insert into roles (id, workspace_id, label, kind, levels)
              values ('extra', ${wsA2}, 'Extra', 'custom', '{}')`
        ))
        return { members: roleKept.length, workspaces: workspaces.length, role: refusalOf(role) }
      }).pipe(Effect.provideService(CurrentUser, alice))
    )
    expect(tried).toEqual({ members: 0, workspaces: 0, role: rlsRefusal("roles") })
  })

  it("acts as a person only inside a workspace they are an active member of", async () => {
    const tried = await run(
      Effect.gen(function*() {
        const db = yield* Db
        // Carol was removed from A, Dave deactivated there; neither ever belonged to B.
        yield* db.routing((sql) =>
          sql`insert into auth."user" (id, name, email, email_verified, created_at, updated_at)
              values (${carol.id}, 'c', ${carol.email}, true, now(), now()),
                     (${dave.id}, 'd', ${dave.email}, true, now(), now())`
        )
        yield* db.asUserIn(wsA)((sql) =>
          Effect.gen(function*() {
            yield* sql`insert into roles (id, workspace_id, label, kind, levels) values ('staff', ${wsA}, 'Medewerker', 'system', '{}')`
            yield* sql`insert into members (id, workspace_id, user_id, role_id, removed_at, deactivated_at)
                       values (${mintId("mem")}, ${wsA}, ${carol.id}, 'staff', now(), null),
                              (${mintId("mem")}, ${wsA}, ${dave.id}, 'staff', null, now())`
          })
        ).pipe(Effect.provideService(CurrentUser, alice))
        const into = (user: SessionUser, workspaceId: WorkspaceId) =>
          Effect.exit(db.asUserIn(workspaceId)((sql) => sql`select 1`).pipe(Effect.provideService(CurrentUser, user)))
        return {
          stranger: yield* into(alice, wsB),
          removed: yield* into(carol, wsA),
          deactivated: yield* into(dave, wsA),
          member: yield* into(alice, wsA)
        }
      })
    )
    const refused = (exit: (typeof tried)["removed"]) =>
      exit._tag === "Failure" ? exit.cause.reasons.map((r) => (r._tag === "Fail" ? r.error._tag : r._tag)) : []
    expect(refused(tried.stranger)).toEqual(["NotFound"])
    expect(refused(tried.removed)).toEqual(["NotFound"])
    expect(refused(tried.deactivated)).toEqual(["NotFound"])
    expect(tried.member._tag).toBe("Success")
  })

  it("holds a newcomer to the rows founding and invitations write (0096)", async () => {
    const seen = await run(
      Effect.gen(function*() {
        const db = yield* Db
        // B has settings of its own; Alice is no member of B.
        yield* db.asUserIn(wsB)((sql) =>
          sql`insert into workspace_settings (workspace_id, section, value) values (${wsB}, 'shipping', '{}')`
        ).pipe(Effect.provideService(CurrentUser, bob))
        const asNewcomer = <A, E>(f: (sql: Parameters<Parameters<typeof db.forUser>[0]>[0]) => Effect.Effect<A, E>) =>
          db.asNewcomerIn(wsB)(f).pipe(Effect.provideService(CurrentUser, alice))
        const count = (table: string) =>
          asNewcomer((sql) =>
            Effect.map(sql<{ n: string }>`select count(*)::text as n from ${sql(table)}`, ([r]) => Number(r!.n))
          )
        const asBob = db.asUserIn(wsB)((sql) =>
          Effect.map(sql<{ n: string }>`select count(*)::text as n from workspace_settings`, ([r]) => Number(r!.n))
        ).pipe(Effect.provideService(CurrentUser, bob))
        return {
          read: {
            settings: yield* count("workspace_settings"),
            customers: yield* count("customers"),
            orders: yield* count("orders"),
            teams: yield* count("teams"),
            settingsForBob: yield* asBob
          },
          settings: refusalOf(
            yield* Effect.exit(
              asNewcomer((sql) =>
                sql`insert into workspace_settings (workspace_id, section, value) values (${wsB}, 'links', '{}')`
              )
            )
          ),
          customer: refusalOf(
            yield* Effect.exit(
              asNewcomer((sql) =>
                sql`insert into customers (id, workspace_id, store_id, shopify_id, external_updated_at)
                  values (${mintId("cus")}, ${wsB}, 'sto_none', '1', now())`
              )
            )
          ),
          // Their own member row they may write, nobody else's.
          othersRow: refusalOf(
            yield* Effect.exit(
              asNewcomer((sql) =>
                sql`insert into members (id, workspace_id, user_id, role_id) values (${
                  mintId("mem")
                }, ${wsB}, ${carol.id}, 'owner')`
              )
            )
          ),
          settingsChanged: (yield* asNewcomer((sql) =>
            sql`update workspace_settings set value = '{}' returning section`
          ))
            .length
        }
      })
    )
    expect(seen.read).toEqual({ settings: 0, customers: 0, orders: 0, teams: 0, settingsForBob: 1 })
    expect(seen.settings).toEqual(rlsRefusal("workspace_settings", "workspace_settings_no_newcomer"))
    expect(seen.customer).toEqual(rlsRefusal("customers", "customers_no_newcomer"))
    expect(seen.othersRow).toEqual(rlsRefusal("members", "members_newcomer_insert"))
    expect(seen.settingsChanged).toBe(0)
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

  it("keeps a member's own corner (prefs, views, to-dos, recents) to that member", async () => {
    const seen = await run(
      Effect.gen(function*() {
        const db = yield* Db
        yield* db.scoped((sql) =>
          Effect.gen(function*() {
            yield* sql`insert into user_prefs (workspace_id, member_id, section, value)
                       values (${wsA}, ${members["a"]!}, 'board', '{}')`
            yield* sql`insert into saved_views (id, workspace_id, member_id, list_key, name, filter)
                       values (${mintId("view")}, ${wsA}, ${members["a"]!}, 'orders', 'Vertraagd', '{}')`
            yield* sql`insert into todos (id, workspace_id, member_id, text)
                       values (${mintId("todo")}, ${wsA}, ${members["a"]!}, 'Bel Linyi')`
            yield* sql`insert into recents (workspace_id, member_id, path, kind, label)
                       values (${wsA}, ${members["a"]!}, '/orders/ord_1', 'order', 'SO-1')`
          })
        ).pipe(asMember(members["a"]!, wsA, alice))
        const count = (table: string) => (sql: Parameters<Parameters<typeof db.scoped>[0]>[0]) =>
          Effect.map(sql<{ n: string }>`select count(*)::text as n from ${sql(table)}`, ([r]) => Number(r!.n))
        const tables = ["user_prefs", "saved_views", "todos", "recents"]
        const own = yield* Effect.forEach(tables, (t) => db.scoped(count(t)).pipe(asMember(members["a"]!, wsA, alice)))
        const colleague = yield* Effect.forEach(
          tables,
          (t) => db.scoped(count(t)).pipe(asMember("mem_other", wsA, alice))
        )
        const elsewhere = yield* Effect.forEach(
          tables,
          (t) => db.scoped(count(t)).pipe(asMember(members["b"]!, wsB, bob))
        )
        return { own, colleague, elsewhere }
      })
    )
    expect(seen).toEqual({ own: [1, 1, 1, 1], colleague: [0, 0, 0, 0], elsewhere: [0, 0, 0, 0] })
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

  it("shows a newcomer only the invitation they handle and theirs, its mail, and no card or supplier details (0096)", async () => {
    const theirs = mintId("inv")
    const handled = mintId("inv")
    const seen = await run(
      Effect.gen(function*() {
        const db = yield* Db
        // B pays, works with a supplier, and has invitations: one to Alice, one to someone else, and that one's mail.
        const supplier = mintId("sup")
        yield* db.scopedFor((sql) =>
          Effect.gen(function*() {
            yield* sql`insert into subscriptions (workspace_id, stripe_customer_id, stripe_subscription_id, status, plan,
                                                  extra_seats, card_last4, card_expiry)
                       values (${wsB}, ${`cus_${runId}`}, ${`sub_${runId}`}, 'active', 'growth', 2, '4242', '12/2030')`
            yield* sql`insert into suppliers (id, workspace_id, name, created_by, contact_email)
                       values (${supplier}, ${wsB}, 'Linyi Trading', ${members["b"]!}, 'sales@linyi.example')`
            yield* sql`insert into invitations (id, workspace_id, email, token_hash, role_id, invited_by, expires_at)
                       values (${theirs}, ${wsB}, ${alice.email}, '\\x01', 'owner', ${members["b"]!},
                               now() + interval '7 days'),
                              (${handled}, ${wsB}, 'iemand@example.com', '\\x02', 'owner', ${members["b"]!},
                               now() + interval '7 days')`
            yield* sql`insert into outbox (id, workspace_id, event, payload)
                       values (${mintId("obx")}, ${wsB}, 'member.invited', ${
              JSON.stringify({ invitationId: handled })
            }::jsonb),
                              (${mintId("obx")}, ${wsB}, 'member.invited', ${
              JSON.stringify({ invitationId: theirs })
            }::jsonb)`
          })
        ).pipe(Effect.provideService(CurrentWorkspace, { id: wsB }))
        const as =
          (invitation?: string) =>
          <A, E>(f: (sql: Parameters<Parameters<typeof db.forUser>[0]>[0]) => Effect.Effect<A, E>) =>
            db.asNewcomerIn(wsB, invitation)(f).pipe(Effect.provideService(CurrentUser, alice))
        return {
          invitations: {
            unhandled: ids(yield* as()((sql) => sql<{ id: string }>`select id from invitations`)),
            handlingAnother: ids(yield* as(handled)((sql) => sql<{ id: string }>`select id from invitations`)),
            // Handled but not addressed to Alice: read, never changed; hers, but not the one handled: not changed.
            changedNotHers: (yield* as(handled)((sql) =>
              sql`update invitations set declined_at = now() where id = ${handled} returning id`
            )).length,
            changedUnhandled: (yield* as()((sql) =>
              sql`update invitations set declined_at = now() where id = ${theirs} returning id`
            )).length,
            changedHers: (yield* as(theirs)((sql) =>
              sql`update invitations set declined_at = null where id = ${theirs} returning id`
            )).length
          },
          outbox: {
            read: (yield* as(theirs)((sql) =>
              sql<{ invitation: string }>`select payload ->> 'invitationId' as invitation from outbox`
            )).map((r) =>
              r.invitation
            ),
            cancelled: (yield* as(theirs)((sql) =>
              sql`update outbox set cancelled_at = now() where event = 'member.invited' returning id`
            )).length,
            otherEvent: refusalOf(
              yield* Effect.exit(
                as()((sql) =>
                  sql`insert into outbox (id, workspace_id, event, payload)
                    values (${mintId("obx")}, ${wsB}, 'member.removed', '{}')`
                )
              )
            )
          },
          subscriptions: yield* as()((sql) =>
            sql`select card_last4 from subscriptions`
          ),
          seats: yield* as()((sql) =>
            sql<{ status: string; extra: number }>`
            select status, extra_seats as extra from workspace_seat_facts()`
          ),
          suppliers: yield* as()((sql) => sql`select contact_email from suppliers`),
          supplierName: (yield* as()((sql) =>
            sql<{ name: string | null }>`select supplier_name_in_workspace(${supplier}) as name`
          ))[0]!.name
        }
      })
    )
    expect(seen.invitations).toEqual({
      unhandled: [theirs],
      handlingAnother: [handled, theirs].toSorted(),
      changedNotHers: 0,
      changedUnhandled: 0,
      changedHers: 1
    })
    expect(seen.outbox).toEqual({
      read: [theirs],
      cancelled: 1,
      otherEvent: rlsRefusal("outbox", "outbox_newcomer_insert")
    })
    expect(seen.subscriptions).toEqual([])
    expect(seen.seats).toEqual([{ status: "active", extra: 2 }])
    expect(seen.suppliers).toEqual([])
    expect(seen.supplierName).toBe("Linyi Trading")
  })

  it("keeps the newcomer out of every table with row level security but founding's and the invitations' (0096)", async () => {
    const rows = await run(
      Effect.flatMap(
        Effect.service(Db),
        (db) =>
          db.routing((sql) =>
            sql<{ table: string; blind: boolean; may: boolean }>`
            select c.relname as table,
                   exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = c.relname || '_no_newcomer')
                     as blind,
                   (select count(*) from pg_policy p where p.polrelid = c.oid and p.polname like c.relname || '_newcomer_%') = 4
                     as may
            from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relrowsecurity
              and not c.relispartition
            order by c.relname`
          )
      )
    )
    expect(rows.length).toBeGreaterThan(TENANT_TABLES.length)
    for (const row of rows) expect(row.blind !== row.may, `${row.table}: newcomerBlind or newcomerMay`).toBe(true)
    expect(rows.filter((r) => r.may).map((r) => r.table)).toEqual([...NEWCOMER_TABLES].toSorted())
  })
})
