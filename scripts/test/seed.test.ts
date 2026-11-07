import { PgClient } from "@effect/sql-pg"
import { WorkspaceId } from "@insyte/domain/Ids"
import { Effect, Redacted, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { describe, expect, it } from "vitest"
import { LOCAL_OWNER_URL } from "../lib/local-db.ts"
import { SCENARIOS, seed, seeded, seedId, seedWorkspaceId } from "../lib/seed.ts"

/*
 * The seed (M1.5): ids every run agrees on, valid as the domain's TypeIDs, and a second run that changes nothing.
 * Against the compose database as its owner, as `bun run db:seed --local` writes it.
 */
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(PgClient.layer({ url: Redacted.make(LOCAL_OWNER_URL) }))))

describe("the seed", () => {
  it("names each scenario's workspace the same way on every run, as a valid id", () => {
    for (const scenario of SCENARIOS) {
      expect(Schema.is(WorkspaceId)(seedWorkspaceId(scenario))).toBe(true)
      expect(seedWorkspaceId(scenario)).toBe(seedWorkspaceId(scenario))
    }
    expect(new Set(SCENARIOS.map(seedWorkspaceId)).size).toBe(3)
    expect(seedId("usr", "a@example.com")).not.toBe(seedId("usr", "b@example.com"))
  })

  it("writes the three scenario workspaces, and a second run changes nothing", async () => {
    const first = await run(seed)
    const second = await run(seed)
    expect(second).toEqual(first)
    expect(first.map((w) => [w.scenario, w.members])).toEqual([["empty", 1], ["settled", 5], ["busy", 10]])
    expect(await run(seeded)).toEqual(["empty", "settled", "busy"])
  })
})
