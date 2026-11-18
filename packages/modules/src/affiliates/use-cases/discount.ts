import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import {
  CODE_DISCOUNT_BY_CODE,
  DISCOUNT_CODE_CREATE,
  DISCOUNT_CODE_DEACTIVATE,
  isTaken
} from "../../returns/domain/Shopify.ts"
import type { WriteOutcome } from "../../shared/domain/ShopifyWrites.ts"
import { isAnswer, mutate } from "../../stores/domain/Gate.ts"
import { gidId } from "../../stores/domain/Mirror.ts"
import { ConnectionGate, missingScope } from "../../stores/domain/Ports.ts"

/*
 * An affiliate's code as a Shopify discount (M16 step 5), in `ShopifyWriteWorkflow` once the approval's undo window
 * has passed: `discountCodeBasicCreate`, the programme's percentage off for every customer, without end.
 *
 * A code that already exists in the store is the brand's, not the affiliate's: before making it, the code is looked up
 * (`codeDiscountNodeByCode`), and a discount found there counts as made only when it is Insyte's own for this
 * affiliate (the id stored, or the title Insyte gives it, which carries the affiliate's id and never its name);
 * anything else leaves the code failed with "Code bestaat al in Shopify", and attribution by that code waits (it needs
 * `made`). A step tried again finds its own discount and keeps it. A store that has not approved `write_discounts`
 * yet, or no store at all, leaves the affiliate approved with its code; the team reads the reason and can change the
 * code or try again.
 *
 * The step settles only the code it made: one the brand changed meanwhile ("Code wijzigen") or an affiliate erased
 * keeps the step's discount from being taken for theirs, and the step ends it in Shopify instead of leaving it live
 * and untracked. An erased affiliate's discount (`erased`) is ended the same way.
 */

const SCOPE_REASON = "Insyte mag nog geen kortingscodes maken in deze winkel"
export const TAKEN_REASON = "Code bestaat al in Shopify"

interface Target {
  readonly id: string
  readonly shopifyDiscountId: string | null
  readonly code: string
  readonly discountState: string
  readonly percent: number
  readonly connectionId: string | null
  readonly shop: string | null
}

const targetOf = (sql: SqlClient.SqlClient, affiliateId: string) =>
  sql<Target>`
    select a.id, a.shopify_discount_id, a.code, a.discount_state, p.discount_percent as percent, s.connection_id, s.shop_domain as shop
    from affiliates a join affiliate_programs p on p.workspace_id = a.workspace_id
    left join lateral (select s.connection_id, s.shop_domain from stores s
                       where s.status in ('connected', 'connecting') and (p.store_id is null or s.id = p.store_id)
                       order by s.created_at limit 1) s on true
    where a.id = ${affiliateId}`

/** The outcome for the code the step read, while it is still the one asked for: \`false\` when it no longer is. */
const settle = (
  t: Pick<Target, "id" | "code">,
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
          where id = ${t.id} and code = ${t.code} and discount_state = 'pending'
          returning id`
      ).pipe(Effect.map((rows) => rows.length > 0))
  )

/** The affiliate holds this discount already (a step run twice settled it): it is theirs, not to be ended. */
const holds = (affiliateId: string, shopifyId: string) =>
  Effect.flatMap(
    Effect.service(Db),
    (db) =>
      db.scopedFor((sql) =>
        sql`select 1 from affiliates
            where id = ${affiliateId} and shopify_discount_id = ${shopifyId} and discount_state = 'made'`
      ).pipe(Effect.map((rows) => rows.length > 0))
  )

/** A discount of Insyte's ended in Shopify; one already gone there is ended as well. */
const end = (store: { readonly connectionId: string; readonly shop: string }, shopifyId: string) =>
  mutate(
    store,
    DISCOUNT_CODE_DEACTIVATE,
    { id: `gid://shopify/DiscountCodeNode/${shopifyId}` },
    "discountCodeDeactivate"
  )
    .pipe(
      Effect.asVoid,
      // The store gone, or Shopify's answer that there is nothing to end: nothing is left live to end.
      Effect.catchTags({
        TokenRefused: () => Effect.void,
        ShopifyRefused: (error) => isAnswer(error) ? Effect.void : Effect.fail(error)
      })
    )

export const discountWriteBack = Effect.fn("Affiliates.discountWriteBack")(function*(affiliateId: string) {
  const db = yield* Db
  const outcome = (o: WriteOutcome["outcome"], reason: string | null = null): WriteOutcome => ({
    id: affiliateId,
    outcome: o,
    reason
  })
  const [t] = yield* db.scopedFor((sql) => targetOf(sql, affiliateId))
  if (t === undefined) return outcome("skipped", "gone")
  if (t.discountState === "erased") {
    // Erased: the discount Shopify has for them ends (a store gone takes it along), and Insyte forgets it.
    if (t.shopifyDiscountId !== null && t.connectionId !== null && t.shop !== null) {
      yield* end({ connectionId: t.connectionId, shop: t.shop }, t.shopifyDiscountId)
    }
    yield* db.scopedFor((sql) =>
      sql`update affiliates set shopify_discount_id = null where id = ${t.id} and discount_state = 'erased'`
    )
    return outcome(t.shopifyDiscountId === null ? "skipped" : "sent", t.shopifyDiscountId === null ? "none" : null)
  }
  if (t.discountState !== "pending") return outcome("skipped", "gone")
  if (t.connectionId === null || t.shop === null) {
    yield* settle(t, "off", "Er is geen Shopify-winkel gekoppeld", null)
    return outcome("skipped", "no_store")
  }
  const title = titleOf(t)
  const basicCodeDiscount = {
    title,
    code: t.code,
    startsAt: new Date().toISOString(),
    context: { all: "ALL" },
    customerGets: { value: { percentage: Math.min(0.9, Math.max(0, t.percent / 100)) }, items: { all: true } },
    combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true }
  }
  const store = { connectionId: t.connectionId, shop: t.shop }
  /** Whose the code is in the store now: nobody's, Insyte's for this affiliate, or someone else's. */
  const holder = Effect.map(
    mutate(store, CODE_DISCOUNT_BY_CODE, { code: t.code }, "codeDiscountNodeByCode"),
    ({ data }): Decided | null => {
      const node = (data as { codeDiscountNodeByCode?: Found | null } | null)?.codeDiscountNodeByCode
      if (node === null || node === undefined) return null
      const id = gidId(node.id)
      return id === t.shopifyDiscountId || node.codeDiscount?.title === title ? { made: id } : { failed: TAKEN_REASON }
    }
  )
  const decided = Effect.gen(function*() {
    const found = yield* holder
    if (found !== null) return found
    const { data, errors } = yield* mutate(
      store,
      DISCOUNT_CODE_CREATE,
      { basicCodeDiscount },
      "discountCodeBasicCreate"
    )
    // Taken between the look and the make: whose it is decides, as before.
    if (isTaken(errors as ReadonlyArray<{ code?: string | null }>)) {
      return (yield* holder) ?? ({ failed: TAKEN_REASON } satisfies Decided)
    }
    if (errors.length > 0) return { failed: errors.map((e) => e.message).join("; ") } satisfies Decided
    const node = (data as { discountCodeBasicCreate?: { codeDiscountNode?: { id: string } | null } })
      ?.discountCodeBasicCreate?.codeDiscountNode
    return { made: node === null || node === undefined ? null : gidId(node.id) } satisfies Decided
  })
  const made: Decided = yield* decided.pipe(
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
    if (yield* settle(t, "made", null, made.made)) return outcome("sent")
    // The code changed, or the affiliate was erased, while Shopify made it: not theirs to keep live.
    if (made.made !== null && !(yield* holds(t.id, made.made))) yield* end(store, made.made)
    return outcome("skipped", "changed")
  }
  yield* settle(t, "failed", made.failed, null)
  return outcome("refused", "scope" in made ? "write_discounts" : made.failed)
})

type Decided =
  | { readonly made: string | null }
  | { readonly failed: string; readonly scope?: true }

interface Found {
  readonly id: string
  readonly codeDiscount?: { readonly title?: string | null } | null
}

/**
 * The title Insyte gives an affiliate's discount: how a discount found under its code is known as Insyte's own. By the
 * affiliate's id, which nobody chooses, never the name, which the affiliate changes (and which an erasure takes away).
 */
const titleOf = (t: Pick<Target, "id" | "code">) => `Insyte affiliate ${t.code} (${t.id})`

/** The Workflow gave up on Shopify (unreachable through every retry): the code stays, to be asked again. */
export const discountFailed = Effect.fn("Affiliates.discountFailed")(function*(affiliateId: string) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    sql`update affiliates set discount_state = 'failed', discount_error = 'Shopify was niet bereikbaar'
        where id = ${affiliateId} and discount_state = 'pending'`
  )
})
