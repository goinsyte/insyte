import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type * as Module from "./Affiliates.ts"

/*
 * The affiliate programme loads with its first use in an isolate, not with the Worker (ADR-0041 §3): the RPC
 * handlers, the relay, the close, the undo table and the routes all reach it through here. A load that fails is a
 * defect of that call; the next one tries again.
 */

let loading: Promise<typeof Module> | undefined

export const affiliates = Effect.promise(() =>
  loading ??= import("./Affiliates.ts").catch((error: unknown) => {
    loading = undefined
    throw error
  })
)

export const withAffiliates = <A, E, R>(f: (m: typeof Module) => Effect.Effect<A, E, R>) =>
  Effect.flatMap(affiliates, f)

/** The brand's undo (`affiliates.restore`) and the portal's (`affiliate_portal.restore`), for the undo table. */
export const RESTORE = "affiliates.restore"
export const PORTAL_RESTORE = "affiliate_portal.restore"

export const restore = (sql: SqlClient.SqlClient, compensation: unknown) =>
  withAffiliates((m) => m.restore(sql, compensation))

export const restorePortal = (sql: SqlClient.SqlClient, compensation: unknown) =>
  withAffiliates((m) => m.restorePortal(sql, compensation))
