import { describe, expect, it } from "vitest"
import { checkMigrations, type MigrationFile } from "../lib/migrations-rules.ts"

const m = (key: string, source: string, dir = "migrations"): MigrationFile => ({
  key,
  path: `${dir}/${key}.ts`,
  source
})
const platform = m("0002_platform", `statements("create table outbox (…)", tenantTable("outbox"))`)
const base = [m("0001_bootstrap", `statements("create extension pg_trgm")`), platform]

describe("migrations:check", () => {
  it("passes a new additive migration", () => {
    expect(checkMigrations(base, [...base, m("0003_auth", `statements("alter table x add column y text")`)], []))
      .toEqual([])
  })

  it("fails a merged migration that was edited", () => {
    const edited = m("0002_platform", `${platform.source} // and one more thing`)
    expect(checkMigrations(base, [base[0]!, edited], [])).toEqual([
      "0002_platform was edited after it was merged; write a new migration instead"
    ])
  })

  it("fails merged migrations that were reordered or removed", () => {
    expect(checkMigrations(base, [platform], [])).toHaveLength(2)
  })

  it("fails a new migration numbered at or below one already merged", () => {
    // 0004 merged first (another pull request); this branch's 0003 would be skipped by every database that has 0004.
    const merged = [...base, m("0004_disputes", `statements("create table disputes (…)")`)]
    expect(checkMigrations(merged, [...merged, m("0003_automations", `statements("select 1")`)], [])).toEqual([
      "0003_automations comes after 0004_disputes: numbers rise through the manifest",
      "0003_automations is numbered at or below 0004, already merged: a database that has it would skip this one; " +
      "renumber it above"
    ])
  })

  it("fails numbers that do not rise through the manifest", () => {
    const head = [...base, m("0005_b", `statements("select 1")`), m("0004_a", `statements("select 1")`)]
    expect(checkMigrations(base, head, [])).toEqual(["0004_a comes after 0005_b: numbers rise through the manifest"])
  })

  it("fails a drop column outside contract/", () => {
    expect(checkMigrations(base, [...base, m("0003_x", `"alter table outbox drop column attempts"`)], [])).toEqual([
      `0003_x: "drop column" is destructive; it belongs in a contract/ migration`
    ])
  })

  it("allows a destructive statement in contract/", () => {
    expect(
      checkMigrations(
        base,
        [...base, m("0003_x", `"alter table outbox drop column attempts"`, "migrations/contract")],
        []
      )
    )
      .toEqual([])
  })

  it("fails a type change and a rename", () => {
    const changes = m("0003_x", `"alter table outbox alter column attempts type bigint", "alter table a rename to b"`)
    expect(checkMigrations(base, [...base, changes], [])).toHaveLength(2)
  })

  it("keeps create index concurrently out of a migration that creates tables", () => {
    const mixed = m("0003_x", `"create table t (id text)", "create index concurrently t_id on t (id)"`)
    expect(checkMigrations(base, [...base, mixed], [])).toEqual([
      "0003_x: create index concurrently goes in a migration of its own"
    ])
  })

  it("fails a tenant table created without its policy", () => {
    const naked = m("0003_x", `"create table orders (workspace_id text not null)"`)
    expect(checkMigrations(base, [...base, naked], ["orders"])).toEqual([
      `0003_x: tenant table orders needs tenantTable("orders") in the same migration`
    ])
  })
})
