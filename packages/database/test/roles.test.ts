import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { describe, expect, it } from "vitest"
import { APP_URL } from "./urls.ts"

/*
 * The role the Workers connect as (M18, "Security"; 06 §1): `insyte_app` bypasses no row level security, holds no
 * privilege a migration needs, owns nothing (an owner can switch a table's RLS off), and inherits from no role that
 * could do either. And the catalogue's side: every table with row level security forces it, so the owner is held too,
 * and every table that holds a `workspace_id` has it. Read from the catalogue as `insyte_app`, which may read it.
 */

const query = <A extends object>(text: string) =>
  Effect.runPromise(
    Effect.flatMap(Effect.service(SqlClient.SqlClient), (sql) => sql.unsafe<A>(text)).pipe(
      Effect.provide(PgClient.layer({ url: Redacted.make(APP_URL) }))
    )
  )

/** The platform's own tables: no workspace's rows, read by the owner's jobs or the dev routes only. */
const WITHOUT_RLS = [
  "beta_allowlist",
  "captured_mail",
  "captured_product_events",
  "fx_rates",
  "migrations",
  "outbox_sinks",
  "trash_kind_joins"
]

describe("insyte_app", () => {
  it("is the role the Workers connect as, and it bypasses nothing and creates nothing", async () => {
    const rows = await query<{ name: string; flags: string }>(`
      select rolname as name,
             concat_ws(',', nullif(rolsuper, false)::text, nullif(rolbypassrls, false)::text,
                       nullif(rolcreaterole, false)::text, nullif(rolcreatedb, false)::text,
                       nullif(rolreplication, false)::text) as flags
      from pg_roles where rolname = current_user`)
    expect(rows).toEqual([{ name: "insyte_app", flags: "" }])
    const [bypass] = await query<{ bypass: boolean }>(
      `select rolbypassrls as bypass from pg_roles where rolname = 'insyte_app'`
    )
    expect(bypass).toEqual({ bypass: false })
  })

  it("owns no table, view, sequence, function, type or schema", async () => {
    const [owned] = await query<{ relations: string; functions: string; types: string; schemas: string }>(`
      select (select count(*) from pg_class where relowner = 'insyte_app'::regrole)::text as relations,
             (select count(*) from pg_proc where proowner = 'insyte_app'::regrole)::text as functions,
             (select count(*) from pg_type where typowner = 'insyte_app'::regrole)::text as types,
             (select count(*) from pg_namespace where nspowner = 'insyte_app'::regrole)::text as schemas`)
    expect(owned).toEqual({ relations: "0", functions: "0", types: "0", schemas: "0" })
  })

  it("inherits from no role that bypasses row level security or owns a table", async () => {
    const rows = await query<{ role: string }>(`
      select r.rolname as role from pg_roles r
      where r.rolname <> 'insyte_app' and pg_has_role('insyte_app', r.oid, 'member')
        and (r.rolsuper or r.rolbypassrls or exists (select 1 from pg_class c where c.relowner = r.oid))`)
    expect(rows).toEqual([])
  })
})

describe("row level security in the catalogue", () => {
  it("forces it wherever it is on, so the tables' owner is held to the policies too", async () => {
    const rows = await query<{ table: string }>(`
      select c.relname as table from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
        and c.relrowsecurity and not c.relforcerowsecurity`)
    expect(rows).toEqual([])
  })

  it("is on for every table that holds a workspace's rows", async () => {
    const rows = await query<{ table: string }>(`
      select c.relname as table from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'workspace_id' and not a.attisdropped
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity`)
    expect(rows).toEqual([])
  })

  it("is off only on the platform's own tables", async () => {
    const rows = await query<{ table: string }>(`
      select c.relname as table from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
        and not c.relrowsecurity and not c.relispartition
      order by 1`)
    expect(rows.map((r) => r.table)).toEqual(WITHOUT_RLS)
  })
})
