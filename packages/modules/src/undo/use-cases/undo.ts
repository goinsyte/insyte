import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { restore as restoreCustomers } from "../../customers/use-cases/commands.ts"
import { restore as restoreMarketing } from "../../marketing/use-cases/klaviyo.ts"
import { restore as restoreOrders } from "../../orders/use-cases/commands.ts"
import { restore as restoreProducts } from "../../products/use-cases/commands.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"

/*
 * `Shared.undo(token)` (ADR-0023): the token spent, its held-back effects cancelled, and its compensation run on the
 * same transaction as a command of its own, with that command's policy and audit. Each reversible command's slice
 * adds its compensation here under the name it issues the token with.
 */

const COMPENSATIONS = {
  "orders.restore": restoreOrders,
  "products.restore": restoreProducts,
  "customers.restore": restoreCustomers,
  "marketing.restore": restoreMarketing
} satisfies Record<string, (sql: SqlClient.SqlClient, compensation: unknown) => Effect.Effect<void, unknown, unknown>>

export const undo = Effect.fn("Shared.undo")(function*(token: string) {
  const db = yield* Db
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const { command, compensation } = yield* Undo.redeem(sql, token)
      const run = COMPENSATIONS[command as keyof typeof COMPENSATIONS]
      if (run === undefined) return yield* Effect.die(new Error(`no compensation for ${command}`))
      yield* run(sql, compensation)
    })
  )
})
