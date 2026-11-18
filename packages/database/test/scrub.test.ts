import { PgClient } from "@effect/sql-pg"
import { mintId } from "@insyte/domain/Ids"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { describe, expect, it } from "vitest"
import { OWNER_URL } from "./urls.ts"

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

        const [scrub] = yield* sql<{ n: number }>`select scrub_workspace(${PATTERNS}::text[]) as n`
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
        return { scrubbed: scrub?.n ?? 0, seeded, left, version }
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
    expect(result.version?.note).toBe("Voor [verwijderd]")
    expect(result.version?.nodes).not.toContain(EMAIL)
  }, 120_000)
})
