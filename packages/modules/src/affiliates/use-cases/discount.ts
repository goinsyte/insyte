import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { DISCOUNT_CODE_CREATE, isTaken } from "../../returns/domain/Shopify.ts"
import type { WriteOutcome } from "../../shared/domain/ShopifyWrites.ts"
import { isAnswer, mutate } from "../../stores/domain/Gate.ts"
import { gidId } from "../../stores/domain/Mirror.ts"
import { ConnectionGate, missingScope } from "../../stores/domain/Ports.ts"

/*
 * An affiliate's code as a Shopify discount (M16 step 5), in `ShopifyWriteWorkflow` once the approval's undo window
 * has passed: `discountCodeBasicCreate`, the programme's percentage off for every customer, without end. Idempotent:
 * the code is the affiliate's own, so a step tried again finds it taken and keeps what it made. A store that has not
 * approved `write_discounts` yet, or no store at all, leaves the affiliate approved with its code; the team reads
 * "Kortingscode kon niet in Shopify worden aangemaakt" with the reason, and can try again.
 */

const SCOPE_REASON = "Insyte mag nog geen kortingscodes maken in deze winkel"

interface Target {
  readonly code: string
  readonly name: string
  readonly discountState: string
  readonly percent: number
  readonly connectionId: string | null
  readonly shop: string | null
}

const targetOf = (sql: SqlClient.SqlClient, affiliateId: string) =>
  sql<Target>`
    select a.code, a.name, a.discount_state, p.discount_percent as percent, s.connection_id, s.shop_domain as shop
    from affiliates a join affiliate_programs p on p.workspace_id = a.workspace_id
    left join lateral (select s.connection_id, s.shop_domain from stores s
                       where s.status in ('connected', 'connecting') and (p.store_id is null or s.id = p.store_id)
                       order by s.created_at limit 1) s on true
    where a.id = ${affiliateId}`

const settle = (
  affiliateId: string,
  state: "made" | "failed" | "off",
  error: string | null,
  shopifyId: string | null
) =>
  Effect.flatMap(
    Effect.service(Db),
    (db) =>
      db.scopedFor((sql) =>
        sql`update affiliates set discount_state = ${state}, discount_error = ${error},
                 shopify_discount_id = coalesce(${shopifyId}, shopify_discount_id)
          where id = ${affiliateId} and discount_state = 'pending'`
      )
  )

export const discountWriteBack = Effect.fn("Affiliates.discountWriteBack")(function*(affiliateId: string) {
  const db = yield* Db
  const outcome = (o: WriteOutcome["outcome"], reason: string | null = null): WriteOutcome => ({
    id: affiliateId,
    outcome: o,
    reason
  })
  const [t] = yield* db.scopedFor((sql) => targetOf(sql, affiliateId))
  if (t === undefined || t.discountState !== "pending") return outcome("skipped", "gone")
  if (t.connectionId === null || t.shop === null) {
    yield* settle(affiliateId, "off", "Er is geen Shopify-winkel gekoppeld", null)
    return outcome("skipped", "no_store")
  }
  const basicCodeDiscount = {
    title: `Affiliate ${t.name} (${t.code})`,
    code: t.code,
    startsAt: new Date().toISOString(),
    context: { all: "ALL" },
    customerGets: { value: { percentage: Math.min(0.9, Math.max(0, t.percent / 100)) }, items: { all: true } },
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true }
  }
  const store = { connectionId: t.connectionId, shop: t.shop }
  const made = yield* mutate(store, DISCOUNT_CODE_CREATE, { basicCodeDiscount }, "discountCodeBasicCreate").pipe(
    Effect.map(({ data, errors }) => {
      // Taken: made on an earlier try of this step, under the affiliate's own code.
      if (errors.length > 0 && !isTaken(errors as ReadonlyArray<{ code?: string | null }>)) {
        return { failed: errors.map((e) => e.message).join("; ") } as const
      }
      const node = (data as { discountCodeBasicCreate?: { codeDiscountNode?: { id: string } | null } })
        ?.discountCodeBasicCreate?.codeDiscountNode
      return { made: node === null || node === undefined ? null : gidId(node.id) } as const
    }),
    Effect.catchTags({
      TokenRefused: () => Effect.succeed({ failed: "De winkel is niet meer gekoppeld" } as const),
      ShopifyRefused: (error) => {
        if (missingScope(error) !== undefined) return Effect.succeed({ failed: SCOPE_REASON, scope: true } as const)
        if (isAnswer(error)) return Effect.succeed({ failed: error.reason } as const)
        return Effect.flatMap(
          error.status === 401
            ? Effect.flatMap(Effect.service(ConnectionGate), (gate) => gate.forget(t.connectionId!))
            : Effect.void,
          () => Effect.fail(error)
        )
      }
    })
  )
  if ("made" in made) {
    yield* settle(affiliateId, "made", null, made.made)
    return outcome("sent")
  }
  yield* settle(affiliateId, "failed", made.failed, null)
  return outcome("refused", "scope" in made ? "write_discounts" : made.failed)
})

/** The Workflow gave up on Shopify (unreachable through every retry): the code stays, to be asked again. */
export const discountFailed = Effect.fn("Affiliates.discountFailed")(function*(affiliateId: string) {
  yield* settle(affiliateId, "failed", "Shopify was niet bereikbaar", null)
})
