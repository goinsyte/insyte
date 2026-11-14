import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import { ConnectionGate, ShopifyAdmin } from "../domain/Ports.ts"

/**
 * A workspace being deleted (M17 step 5): Insyte's app uninstalled from each of its shops, with the token the gate
 * holds, before the credentials go. As the workspace; a shop that refuses is logged, not retried: its token goes
 * with the workspace either way. Answers how many shops let go.
 */
export const releaseStores = Effect.fn("Stores.release")(function*() {
  const db = yield* Db
  const gate = yield* ConnectionGate
  const admin = yield* ShopifyAdmin
  const stores = yield* db.scopedFor((sql) =>
    sql<{ shop: string; connectionId: string }>`
      select s.shop_domain as shop, s.connection_id from stores s
      join connections c on c.id = s.connection_id
      join connection_credentials cc on cc.connection_id = c.id
      where c.provider = 'shopify'`
  )
  let released = 0
  for (const store of stores) {
    const done = yield* gate.accessToken(store.connectionId).pipe(
      Effect.flatMap((token) => admin.uninstall(store.shop, token)),
      Effect.as(true),
      Effect.catch((error) =>
        Effect.as(Effect.logWarning("a shop did not let go of Insyte", { shop: store.shop, error }), false)
      )
    )
    if (done) released++
  }
  return released
})
