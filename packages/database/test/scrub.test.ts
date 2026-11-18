import { PgClient } from "@effect/sql-pg"
import { mintId } from "@insyte/domain/Ids"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { describe, expect, it } from "vitest"
import { APP_URL, OWNER_URL } from "./urls.ts"

/*
 * A shopper's erasure, last step (`scrub_workspace`, 0076 and 0106): every text the workspace keeps loses their address
 * and name, and no column's checks roll the erasure back. The strictest seed there is, for every column the scrub
 * writes that has a check: a probe table per column, with that column's own checks and unique keys, holding the
 * shopper at the column's length limit, alone (so the placeholder must stand for the whole value), and beside a value
 * the placeholder would collide with. And a published automation version, immutable to everything but the erasure.
 * As `insyte_owner`, in a transaction that is rolled back: nothing stays.
 */

const EMAIL = "anna.devries@voorbeeld.nl"
const NAME = "Annabel Vos"
const pattern = (literal: string) => `(?<![[:alnum:]])${literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![[:alnum:]])`
const PATTERNS = [EMAIL, NAME].map(pattern)

interface Target {
  readonly table: string
  readonly column: string
  readonly type: "text" | "jsonb" | "_text"
  readonly nullable: boolean
  readonly checks: ReadonlyArray<string>
  readonly uniques: ReadonlyArray<string>
}

class Rollback {
  readonly _tag = "Rollback"
  readonly result: unknown
  constructor(result: unknown) {
    this.result = result
  }
}

/** Every column the scrub writes (its own filter, 0076) with a check on that column alone, and its unique keys. */
const targetsOf = (sql: SqlClient.SqlClient) =>
  sql<Target>`
    with cols as (
      select c2.table_name, c2.column_name, c2.udt_name, c2.is_nullable = 'YES' as nullable,
             to_regclass('public.' || quote_ident(c2.table_name)) as rel
        from information_schema.columns c2
        join information_schema.tables t2 on t2.table_schema = c2.table_schema and t2.table_name = c2.table_name
       where c2.table_schema = 'public' and t2.table_type = 'BASE TABLE'
         and c2.udt_name in ('text', 'jsonb', '_text') and c2.is_generated = 'NEVER'
         and c2.column_name <> 'id' and c2.column_name !~ '(_id|_key|_ids|_hash)$'
         and c2.table_name <> 'connection_credentials' and c2.table_name !~ '^zz_scrub_probe_'
         and exists (select 1 from information_schema.columns w where w.table_schema = 'public'
                       and w.table_name = c2.table_name and w.column_name = 'workspace_id')
         and not exists (select 1 from pg_inherits i where i.inhrelid = to_regclass('public.' || quote_ident(c2.table_name)))
    )
    select cols.table_name as table, cols.column_name as column, cols.udt_name as type, cols.nullable,
           coalesce((select array_agg(pg_get_constraintdef(con.oid)) from pg_constraint con
                      join pg_attribute a on a.attrelid = con.conrelid and a.attname = cols.column_name
                     where con.conrelid = cols.rel and con.contype = 'c' and con.conkey = array[a.attnum]), '{}') as checks,
           coalesce((select array_agg(substring(pg_get_indexdef(i.indexrelid) from 'USING btree (.*)$'))
                      from pg_index i
                     where i.indrelid = cols.rel and i.indisunique and i.indpred is null
                       and exists (select 1 from pg_attribute a where a.attrelid = cols.rel and a.attname = cols.column_name
                                     and (a.attnum = any(i.indkey) or pg_get_indexdef(i.indexrelid) like '%(' || a.attname || ')%'))
                       and not exists (select 1 from unnest(i.indkey) k join pg_attribute a2
                                         on a2.attrelid = cols.rel and a2.attnum = k
                                       where a2.attname not in ('workspace_id', cols.column_name))), '{}') as uniques
      from cols
     where exists (select 1 from pg_constraint con join pg_attribute a on a.attrelid = con.conrelid
                    and a.attname = cols.column_name
                   where con.conrelid = cols.rel and con.contype = 'c' and con.conkey = array[a.attnum])
     order by 1, 2`

/** The strictest values a column of this type and length limit can hold with the shopper in them. */
const seedsFor = (target: Target) => {
  const limits = target.checks.flatMap((c) => [...c.matchAll(/<= (\d+)/g)].map((m) => Number(m[1])))
  const max = limits.length === 0 ? 300 : Math.min(...limits)
  const padded = (needle: string) => max > needle.length + 1 ? [`${"x".repeat(max - needle.length - 1)} ${needle}`] : []
  const text = [EMAIL, NAME, `${NAME} <${EMAIL}>`, ...padded(EMAIL), ...padded(NAME), "[verwijderd]"]
  switch (target.type) {
    case "text":
      return text
    case "jsonb":
      return [
        JSON.stringify([EMAIL]),
        JSON.stringify({ name: NAME, address: EMAIL }),
        JSON.stringify(EMAIL),
        JSON.stringify([{ to: [{ name: NAME, address: EMAIL }] }])
      ]
    case "_text":
      return [`{${EMAIL}}`, `{"${NAME}",${EMAIL}}`]
  }
}

const inTransaction = <A>(body: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      return yield* sql.withTransaction(Effect.flatMap(body(sql), (a) => Effect.fail(new Rollback(a)))).pipe(
        Effect.catch((e) => e instanceof Rollback ? Effect.succeed(e.result as A) : Effect.fail(e))
      )
    }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(OWNER_URL) }).pipe(Layer.orDie)))
  )

/** Every message along an error's causes: the database's own words are at the bottom. */
const messageOf = (e: unknown): string => {
  const parts: Array<string> = []
  for (let at: unknown = e, guard = 0; at !== undefined && at !== null && guard < 8; guard++) {
    const message = (at as { message?: unknown }).message
    if (typeof message === "string") parts.push(message)
    at = (at as { cause?: unknown; reason?: unknown }).cause ?? (at as { reason?: unknown }).reason
  }
  return parts.join(" / ")
}

/** Runs `statement` in a savepoint: answers whether it went in, and leaves the transaction usable if it did not. */
const tryIn = (sql: SqlClient.SqlClient, statement: Effect.Effect<unknown, unknown>) =>
  sql.unsafe("savepoint seed").pipe(
    Effect.andThen(statement),
    Effect.andThen(sql.unsafe("release savepoint seed")),
    Effect.as(true),
    Effect.catch(() => Effect.as(sql.unsafe("rollback to savepoint seed"), false))
  )

describe("a shopper's erasure across every table", () => {
  it("keeps every column's checks with the strictest seed, and leaves the shopper nowhere", async () => {
    const result = await inTransaction((sql) =>
      Effect.gen(function*() {
        const ws = mintId("ws")
        yield* sql`select set_config('app.workspace_id', ${ws}, true), set_config('app.principal_kind', 'system', true)`
        yield* sql`insert into workspaces (id, name, slug) values (${ws}, 'Scrub', ${`scrub-${ws.slice(-8)}`})`
        // A published version: immutable, but the erasure may blank the shopper in its note and steps.
        const automation = mintId("aut")
        yield* sql`insert into automations (id, workspace_id, name, created_by)
                   values (${automation}, ${ws}, 'Flow', 'mem_x')`
        yield* sql`insert into automation_versions (workspace_id, automation_id, version, nodes, note, published_by)
                   values (${ws}, ${automation}, 1, ${JSON.stringify([{ text: `Mail ${EMAIL}` }])}::jsonb,
                           ${`Voor ${NAME}`}, 'mem_x')`

        const targets = yield* targetsOf(sql)
        const seeded: Array<{ probe: string; target: Target; rows: number }> = []
        for (const [i, target] of targets.entries()) {
          const probe = `zz_scrub_probe_${i}`
          const type = target.type === "_text" ? "text[]" : target.type
          yield* sql.unsafe(
            `create table ${probe} (workspace_id text not null, "${target.column}" ${type}${
              target.nullable ? "" : " not null"
            })`
          )
          for (const check of target.checks) yield* sql.unsafe(`alter table ${probe} add ${check}`)
          for (const unique of target.uniques) yield* sql.unsafe(`create unique index on ${probe} ${unique}`)
          let rows = 0
          for (const seed of seedsFor(target)) {
            const cast = target.type === "_text" ? "text[]" : target.type
            const ok = yield* tryIn(
              sql,
              sql.unsafe(`insert into ${probe} (workspace_id, "${target.column}") values ($1, $2::${cast})`, [ws, seed])
            )
            if (ok) rows++
          }
          seeded.push({ probe, target, rows })
        }

        // A partitioned table, its partition sealed as 0097 seals them (row security forced, no policy): a cell that
        // breaks the length check is written through the table, never the partition.
        yield* sql.unsafe(`create table zz_scrub_parted (workspace_id text not null,
                             title text not null check (char_length(title) <= 30)) partition by list (workspace_id)`)
        yield* sql.unsafe(`create table zz_scrub_parted_one partition of zz_scrub_parted for values in ('${ws}')`)
        yield* sql.unsafe("alter table zz_scrub_parted_one enable row level security")
        yield* sql.unsafe("alter table zz_scrub_parted_one force row level security")
        const atLimit = `${"x".repeat(30 - NAME.length - 1)} ${NAME}`
        yield* sql`insert into zz_scrub_parted (workspace_id, title) values (${ws}, ${atLimit}), (${ws}, ${NAME})`

        const [scrub] = yield* sql<{ n: number }>`select scrub_workspace(${PATTERNS}::text[]) as n`
        const parted = yield* sql<{ title: string }>`select title from zz_scrub_parted order by title`
        const left: Array<string> = []
        for (const { probe, target } of seeded) {
          const found = yield* sql.unsafe<{ v: string }>(
            `select "${target.column}"::text as v from ${probe} where "${target.column}"::text ~* $1`,
            [`(${PATTERNS.join("|")})`]
          )
          left.push(...found.map((f) => `${target.table}.${target.column}: ${f.v.slice(-60)}`))
        }
        const [version] = yield* sql<{ note: string; nodes: string }>`
          select note, nodes::text as nodes from automation_versions where automation_id = ${automation}`
        return { scrubbed: scrub?.n ?? 0, seeded, left, version, parted: parted.map((r) => r.title) }
      })
    )
    // The seeds reached the columns that matter: length limits, not-blank checks and unique keys among them.
    const reached = (table: string, column: string) =>
      result.seeded.find((s) => s.target.table === table && s.target.column === column)?.rows ?? 0
    expect(reached("chargebacks", "customer_name")).toBeGreaterThan(2)
    expect(reached("tickets", "title")).toBeGreaterThan(2)
    expect(reached("knowledge_gaps", "question")).toBeGreaterThan(2)
    expect(reached("sheet_folders", "name")).toBeGreaterThan(0)
    expect(result.scrubbed).toBeGreaterThan(0)
    expect(result.left).toEqual([])
    expect(result.parted).toEqual(["[verwijderd]", `${"x".repeat(30 - NAME.length - 1)} `])
    expect(result.version?.note).toBe("Voor [verwijderd]")
    expect(result.version?.nodes).not.toContain(EMAIL)
  }, 120_000)

  it("fails the erasure, naming the column but never the value, where no placeholder fits", async () => {
    const result = await inTransaction((sql) =>
      Effect.gen(function*() {
        const ws = mintId("ws")
        yield* sql`select set_config('app.workspace_id', ${ws}, true), set_config('app.principal_kind', 'system', true)`
        yield* sql`insert into workspaces (id, name, slug) values (${ws}, 'Scrub', ${`scrub-${ws.slice(-8)}`})`
        // An address the column's check takes, and none of the placeholders: it can only stay or fail.
        yield* sql.unsafe(`create table zz_scrub_kept (workspace_id text not null,
                             address text not null check (address ~ '^[a-z.]+@voorbeeld\\.nl$'))`)
        yield* sql`insert into zz_scrub_kept (workspace_id, address) values (${ws}, ${EMAIL})`
        const request = mintId("gdpr")
        // As "Gegevens wissen" does it: the erasure, then its request marked done, in one transaction.
        yield* sql.unsafe("savepoint erase")
        const failed = yield* sql`select scrub_workspace(${PATTERNS}::text[])`.pipe(
          Effect.andThen(
            sql`insert into gdpr_requests (id, workspace_id, kind, source, payload, due_at, state, completed_at)
                values (${request}, ${ws}, 'customer_redact', 'operator', '{}', now(), 'done', now())`
          ),
          Effect.as(undefined),
          Effect.catch((e) => Effect.succeed(messageOf(e)))
        )
        yield* sql.unsafe("rollback to savepoint erase")
        const [done] = yield* sql<{ n: number }>`select count(*)::int as n from gdpr_requests where id = ${request}`
        const [kept] = yield* sql<{ address: string }>`select address from zz_scrub_kept`
        return { failed, done: done?.n ?? 0, kept: kept?.address }
      })
    )
    expect(result.failed).toContain("zz_scrub_kept.address")
    expect(result.failed).not.toContain(EMAIL)
    expect(result.done).toBe(0)
  }, 120_000)
})

describe("a published automation version under the erasure's bypass", () => {
  it("takes only the scrub's own change to its words, never the app's or another column's", async () => {
    const ws = mintId("ws")
    const automation = mintId("aut")
    const asOwner = <A>(body: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
      Effect.runPromise(
        Effect.gen(function*() {
          const sql = yield* SqlClient.SqlClient
          yield* sql`select set_config('app.workspace_id', ${ws}, false), set_config('app.principal_kind', 'system', false)`
          return yield* body(sql)
        }).pipe(
          Effect.scoped,
          Effect.provide(PgClient.layer({ url: Redacted.make(OWNER_URL), maxConnections: 1 }).pipe(Layer.orDie))
        )
      )
    const attempt = (url: string, change: string) =>
      Effect.runPromise(
        Effect.gen(function*() {
          const sql = yield* SqlClient.SqlClient
          return yield* sql.withTransaction(
            Effect.gen(function*() {
              yield* sql`select set_config('app.workspace_id', ${ws}, true),
                                set_config('app.principal_kind', 'system', true),
                                set_config('app.scrubbing', 'on', true)`
              const rows = yield* sql.unsafe<{ note: string }>(
                `update automation_versions set ${change} where automation_id = $1 returning note`,
                [automation]
              )
              return rows.length === 1 ? "changed" : "unseen"
            })
          ).pipe(Effect.catch((e) => Effect.succeed(messageOf(e))))
        }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url) }).pipe(Layer.orDie)))
      )
    await asOwner((sql) =>
      Effect.gen(function*() {
        yield* sql`insert into workspaces (id, name, slug) values (${ws}, 'Bevroren', ${`frozen-${ws.slice(-8)}`})`
        yield* sql`insert into automations (id, workspace_id, name, created_by) values (${automation}, ${ws}, 'Flow', 'mem_x')`
        yield* sql`insert into automation_versions (workspace_id, automation_id, version, nodes, note, published_by)
                   values (${ws}, ${automation}, 1, '[]'::jsonb, 'Voor iemand', 'mem_x')`
      })
    )
    try {
      // The app, with every setting the scrub sets: still immutable.
      expect(await attempt(APP_URL, "note = 'tampered'")).toContain("immutable")
      expect(await attempt(APP_URL, "note = 'tampered', version = 99")).toContain("immutable")
      // As the scrub's definer: its words may change, nothing else.
      expect(await attempt(OWNER_URL, "version = 99")).toContain("immutable")
      expect(await attempt(OWNER_URL, "note = 'Voor [verwijderd]', published_by = 'mem_y'")).toContain("immutable")
      expect(await attempt(OWNER_URL, "note = 'Voor [verwijderd]'")).toBe("changed")
    } finally {
      await asOwner((sql) => sql`delete from workspaces where id = ${ws}`)
    }
  }, 120_000)
})
