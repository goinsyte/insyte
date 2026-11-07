import { SYSTEM_DEFAULTS } from "@insyte/domain/Permissions"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { createHash } from "node:crypto"

/*
 * The three scenario workspaces of the design reference (M1.5): `empty`, `settled` and `busy`, from its fixtures, so a
 * preview opens on the states the screens were drawn for. Written as `insyte_owner` with deterministic ids, inside each
 * workspace's scope (every tenant table forces its policy, the owner's writes included), and idempotent: a second run
 * changes nothing. It writes only the tables that exist; each milestone extends it with the ones it adds.
 *
 * The fixtures' roles predate the permission catalogue (M3.2): a member whose role is a system role's label gets that
 * role, any other label a custom role with that label on read-only levels, until M3.2 seeds the catalogue's roles.
 * Seeded people have no password: they own the data, nobody signs in as them yet.
 */

export const SCENARIOS = ["empty", "settled", "busy"] as const
export type Scenario = (typeof SCENARIOS)[number]

const NAME: Record<Scenario, string> = { empty: "eerste dag", settled: "gewone dinsdag", busy: "drukke week" }

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz"

/** A TypeID that is the same on every run: the prefix and 26 Crockford characters of a hash of `key`. */
export const seedId = (prefix: string, key: string) => {
  const bytes = createHash("sha256").update(`insyte-seed:${key}`).digest()
  let bits = 0n
  for (const byte of bytes.subarray(0, 17)) bits = (bits << 8n) | BigInt(byte)
  let out = ""
  for (let i = 0; i < 26; i++) out += CROCKFORD[Number((bits >> BigInt(5 * (25 - i))) & 31n)]
  // A leading 0, as a UUIDv7 from long ago would have: seeded rows sort before anything made later.
  return `${prefix}_0${out.slice(1)}`
}

export const seedWorkspaceId = (scenario: Scenario) => seedId("ws", `workspace:${scenario}`)

const band = (n: number) => (n <= 1 ? "1" : n <= 5 ? "2-5" : n <= 20 ? "6-20" : "21+")

const systemRole = (label: string) => Object.values(SYSTEM_DEFAULTS).find((r) => r.label === label)

/*
 * The fixtures, loaded at run time: they are the design reference's code (bundler resolution), which the tools'
 * typecheck does not follow, so what the seed relies on in them is decoded here instead.
 */
const FIXTURES = new URL("../../apps/design/src/app/fixtures/mock-data/", import.meta.url)

const Member = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
  role: Schema.String,
  status: Schema.String,
  last_active_at: Schema.optional(Schema.String)
})
const Team = Schema.Array(Member)
const Org = Schema.Struct({ name: Schema.String, country: Schema.String })

const fixtures = Effect.gen(function*() {
  const members = yield* Effect.promise(() => import(new URL("members.ts", FIXTURES).href) as Promise<unknown>)
  const orgs = yield* Effect.promise(() => import(new URL("org.ts", FIXTURES).href) as Promise<unknown>)
  const { membersByScenario } = yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      membersByScenario: Schema.Struct({
        empty: Team,
        settled: Team,
        busy: Schema.declare((u): u is () => unknown => typeof u === "function")
      })
    })
  )(members)
  const { org } = yield* Schema.decodeUnknownEffect(Schema.Struct({ org: Org }))(orgs)
  const busy = yield* Schema.decodeUnknownEffect(Team)(membersByScenario.busy())
  const teams: Record<Scenario, ReadonlyArray<typeof Member.Type>> = {
    empty: membersByScenario.empty,
    settled: membersByScenario.settled,
    busy
  }
  return { org, teams }
}).pipe(Effect.orDie)

const seedScenario = Effect.fn("Seed.scenario")(function*(scenario: Scenario) {
  const sql = yield* SqlClient.SqlClient
  const { org, teams } = yield* fixtures
  const team = teams[scenario].filter((m) => m.status === "active")
  const owner = team[0]!
  const ownerId = seedId("usr", owner.email)
  const workspaceId = seedWorkspaceId(scenario)

  for (const person of team) {
    yield* sql`insert into auth."user" (id, name, email, email_verified, created_at, updated_at)
               values (${seedId("usr", person.email)}, ${person.name}, ${person.email}, true, now(), now())
               on conflict (id) do update set name = excluded.name`
  }

  yield* sql.withTransaction(Effect.gen(function*() {
    yield* sql`select set_config('app.workspace_id', ${workspaceId}, true), set_config('app.user_id', ${ownerId}, true),
                      set_config('app.principal_kind', 'member', true)`
    yield* sql`insert into workspaces (id, name, slug, country, team_size, plan, trial_ends_at, onboarding_completed_at,
                                       settled_at)
               values (${workspaceId}, ${`${org.name} · ${NAME[scenario]}`}, ${`northwind-${scenario}`}, ${org.country},
                       ${band(team.length)}, 'growth', now() + interval '14 days', now(),
                       ${scenario === "empty" ? null : new Date()})
               on conflict (id) do update set name = excluded.name, team_size = excluded.team_size`
    for (const role of Object.values(SYSTEM_DEFAULTS)) {
      yield* sql`insert into roles (id, workspace_id, label, kind, levels, specials, refund_limit_minor, stores)
                 values (${role.id}, ${workspaceId}, ${role.label}, 'system', ${JSON.stringify(role.levels)}::jsonb,
                         ${JSON.stringify(role.specials)}::jsonb,
                         ${role.refundLimit === null ? null : Math.round(role.refundLimit * 100)},
                         ${JSON.stringify(role.stores)}::jsonb)
                 on conflict do nothing`
    }
    const view = SYSTEM_DEFAULTS["view"]!
    for (const person of team) {
      let role = systemRole(person.role)?.id
      if (role === undefined) {
        role = `custom_${person.role.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
        yield* sql`insert into roles (id, workspace_id, label, kind, based_on, levels, specials, stores)
                   values (${role}, ${workspaceId}, ${person.role}, 'custom', 'view', ${
          JSON.stringify(view.levels)
        }::jsonb,
                           ${JSON.stringify(view.specials)}::jsonb, ${JSON.stringify(view.stores)}::jsonb)
                   on conflict do nothing`
      }
      yield* sql`insert into members (id, workspace_id, user_id, role_id, last_active_at)
                 values (${seedId("mem", `${scenario}:${person.email}`)}, ${workspaceId}, ${
        seedId("usr", person.email)
      },
                         ${role}, ${person.last_active_at ?? null})
                 on conflict (workspace_id, user_id) do nothing`
    }
    for (const kind of ["order", "ticket", "chargeback", "return", "invoice", "automation_run"]) {
      yield* sql`insert into workspace_counters (workspace_id, kind) values (${workspaceId}, ${kind})
                 on conflict do nothing`
    }
    // The owner went through onboarding: the track is finished, so they land on Start.
    yield* sql`insert into onboarding_progress (id, user_id, workspace_id, track, step, answers, completed_at)
               values (${seedId("onb", scenario)}, ${ownerId}, ${workspaceId}, 'admin', 'ready',
                       ${JSON.stringify({ persona: "admin", plan: "growth", cycle: "monthly", store: "later" })}::jsonb,
                       now())
               on conflict do nothing`
  }))
  return { scenario, workspaceId, members: team.length }
})

export const seed = Effect.forEach(SCENARIOS, seedScenario)

/** Which scenario workspaces a database holds, each read inside its own scope. */
export const seeded = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const present: Array<Scenario> = []
  for (const scenario of SCENARIOS) {
    const id = seedWorkspaceId(scenario)
    const rows = yield* sql.withTransaction(
      Effect.andThen(
        sql`select set_config('app.workspace_id', ${id}, true), set_config('app.principal_kind', 'member', true)`,
        sql`select id from workspaces where id = ${id}`
      )
    )
    if (rows.length > 0) present.push(scenario)
  }
  return present
})
