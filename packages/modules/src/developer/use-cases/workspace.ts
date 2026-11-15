import { Db } from "@insyte/database/Db"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { inScope } from "../../shared/use-cases/StoreScope.ts"

/*
 * The workspace a key belongs to (M19.3, MCP's `insyte://workspace`): its name, its plan, and the stores the key
 * reaches (`storeScope`), each with what a client needs to name it. Any key reads it, as `/v1/me` names the workspace:
 * no area, nothing about the subscription beyond the plan's name.
 */

export interface KeyWorkspace {
  readonly id: string
  readonly name: string
  readonly plan: string
  readonly trialEndsAt: Date | null
  readonly stores: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly shopDomain: string
    readonly status: string
    readonly currency: string | null
  }>
}

export const workspace = Effect.fn("ApiKeys.workspace")(function*() {
  const { workspaceId } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ name: string; plan: string; trialEndsAt: Date | null }>`
        select name, plan, trial_ends_at from workspaces where id = ${workspaceId}`
      const mine = yield* inScope(sql, "id")
      const stores = yield* sql<KeyWorkspace["stores"][number]>`
        select id, name, shop_domain, status, currency from stores where ${mine}
        order by status = 'disconnected', created_at`
      return {
        id: workspaceId,
        name: row?.name ?? "",
        plan: row?.plan ?? "trial",
        trialEndsAt: row?.trialEndsAt ?? null,
        stores
      } satisfies KeyWorkspace
    })
  )
})
