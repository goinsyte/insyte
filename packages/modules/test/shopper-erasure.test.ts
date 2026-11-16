import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { describe, expect, it } from "vitest"
import { eraseShopper, needles } from "../src/shared/use-cases/ShopperErasure.ts"

/*
 * A shopper's erasure looks for them in every text the workspace keeps (`scrub_workspace`, 0076): their address,
 * name, phone and street, each matched whole, as typed and as JSON writes it. Too short a value would erase other
 * people's words, so it is not looked for.
 */
describe("what an erasure looks for", () => {
  it("escapes each value, matches it whole, and leaves out what is too short", () => {
    const found = needles(["anna@voorbeeld.nl", "Anna de Vries", "Jan", "12", "+31 6 1234 5678", "Hoofdstraat 1"])
    expect(found).toContain("(?<![[:alnum:]])anna@voorbeeld\\.nl(?![[:alnum:]])")
    expect(found).toContain("(?<![[:alnum:]])Anna de Vries(?![[:alnum:]])")
    expect(found).toContain("(?<![[:alnum:]])\\+31 6 1234 5678(?![[:alnum:]])")
    expect(found).toContain("(?<![[:alnum:]])Hoofdstraat 1(?![[:alnum:]])")
    expect(found.some((p) => p.includes("Jan"))).toBe(false)
    expect(found.some((p) => p.includes(">12("))).toBe(false)
  })

  it("looks for a value with a quote as JSON writes it too", () => {
    expect(needles(["Anna \"Ans\" Smit"])).toEqual([
      "(?<![[:alnum:]])Anna \"Ans\" Smit(?![[:alnum:]])",
      "(?<![[:alnum:]])Anna \\\\\"Ans\\\\\" Smit(?![[:alnum:]])"
    ])
  })
})

/** A client that answers every statement with no rows (a count where one is read) and keeps what it was asked. */
const recording = () => {
  const asked: Array<string> = []
  const answer = (text: string) => {
    asked.push(text.replaceAll(/\s+/g, " ").trim())
    return Effect.succeed(/scrub_workspace/.test(text) ? [{ n: 0 }] : [])
  }
  const sql = Object.assign(
    (strings: TemplateStringsArray, ..._values: ReadonlyArray<unknown>) => answer(strings.join("$")),
    { unsafe: (text: string) => answer(text) }
  )
  return { sql: sql as unknown as SqlClient.SqlClient, asked }
}

describe("the order an erasure locks a chat in", () => {
  it("takes the customer agent's rows before the chats, as the agent's turn does", async () => {
    const { sql, asked } = recording()
    await Effect.runPromise(
      eraseShopper(sql, { customerIds: ["cus_1"], emails: ["anna@voorbeeld.nl"], stores: null }).pipe(Effect.orDie)
    )
    const first = (table: string) => asked.findIndex((q) => new RegExp(`^(select|update)[^;]*\\b${table}\\b`).test(q))
    const agent = asked.findIndex((q) => /customer_agent_threads/.test(q) && /for update/.test(q))
    const chats = asked.findIndex((q) => q.startsWith("update channel_threads"))
    expect(agent).toBeGreaterThanOrEqual(0)
    expect(chats).toBeGreaterThanOrEqual(0)
    expect(agent).toBeLessThan(chats)
    // Nothing touches the agent's rows before that lock.
    expect(first("customer_agent_threads")).toBe(agent)
  })
})
