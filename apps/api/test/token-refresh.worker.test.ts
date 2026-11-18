import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { ShopifyRecorded } from "@insyte/integrations-shopify/ShopifyRecorded"
import { Sealer } from "@insyte/modules/shared/domain/Sealer"
import { ShopifyAdmin, ShopifyRefused } from "@insyte/modules/stores/domain/Ports"
import { accessToken } from "@insyte/modules/stores/use-cases/token"
import { Effect, Exit, Redacted } from "effect"
import type { SqlClient } from "effect/sql"
import { ConnectionError, SqlError } from "effect/sql/SqlError"
import { describe, expect, it } from "vitest"

/*
 * A refreshed Shopify token is never lost before it is saved (W13.6). Shopify's refresh token rotates on every use: the
 * old one is spent the moment the new pair is issued, so a refresh whose write did not land leaves the connection with
 * a spent token, and the next refresh is refused (the merchant reconnects). The write is tried again until it lands,
 * and the refresh with its write is not interrupted halfway.
 *
 * Against Shopify's recorded twin, made to rotate as Shopify does (a spent refresh token is refused), and a database
 * whose first writes fail as a connection blip would.
 */

const due = (refreshToken: string) =>
  JSON.stringify({
    accessToken: "old-access",
    refreshToken,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    refreshExpiresAt: null
  })

/** A database holding one sealed pair, whose first `failures` writes of it fail. */
const database = (sealed: string, failures: number) => {
  const state = { sealed, writes: 0, failed: 0 }
  const sql = ((strings: TemplateStringsArray, ...values: ReadonlyArray<unknown>) => {
    const text = strings.join("?")
    if (text.includes("select c.account_ref")) {
      return Effect.succeed([{ shop: "rotating.myshopify.com", sealed: state.sealed }])
    }
    if (text.includes("update connection_credentials")) {
      if (state.failed < failures) {
        state.failed++
        return Effect.fail(new SqlError({ reason: new ConnectionError({ cause: new Error("connection reset") }) }))
      }
      state.writes++
      state.sealed = values[0] as string
      return Effect.succeed([])
    }
    return Effect.succeed([])
  }) as unknown as SqlClient.SqlClient
  const db = { scopedFor: <A, E, R>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>) => f(sql) }
  return { state, db: db as unknown as Db["Service"] }
}

/** The twin, rotating: each refresh token works once. */
const rotating = Effect.gen(function*() {
  const twin = yield* ShopifyAdmin
  const spent = new Set<string>()
  return ShopifyAdmin.of({
    ...twin,
    refresh: (shop, token) => {
      const value = Redacted.value(token)
      if (spent.has(value)) return Effect.fail(new ShopifyRefused({ status: 401, reason: "invalid_grant" }))
      spent.add(value)
      return twin.refresh(shop, token)
    }
  })
}).pipe(Effect.provide(ShopifyRecorded))

const openSealer = Sealer.of({
  seal: (plain) => Effect.succeed({ sealed: plain, kid: "k1" }),
  open: (sealed) => Effect.succeed(Redacted.make(sealed))
})

const refreshed = (db: Db["Service"]) =>
  Effect.flatMap(rotating, (shopify) =>
    accessToken("con_rotating").pipe(
      Effect.provideService(Db, db),
      Effect.provideService(Sealer, openSealer),
      Effect.provideService(ShopifyAdmin, shopify),
      Effect.provideService(CurrentWorkspace, { id: "ws_rotating" as WorkspaceId })
    ))

describe("a Shopify token refresh", () => {
  it("saves the new pair even when the database's first writes fail, and never asks with a spent token", async () => {
    const { state, db } = database(due(`recorded-refresh-rotating-${Date.now()}`), 2)
    const exit = await Effect.runPromiseExit(refreshed(db))
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(state.writes).toBe(1)
    const saved = JSON.parse(state.sealed) as { refreshToken: string; accessToken: string }
    // The pair Shopify issued is the one kept: the next refresh, with it, is not refused.
    expect(saved.refreshToken).toMatch(/^recorded-refresh-r\d+$/)
    expect(Exit.isSuccess(exit) && Redacted.value(exit.value.token)).toBe(saved.accessToken)
  })
})
