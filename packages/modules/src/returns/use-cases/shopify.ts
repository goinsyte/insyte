import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import type { WriteOutcome } from "../../shared/domain/ShopifyWrites.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { isAnswer, mutate } from "../../stores/domain/Gate.ts"
import { fromMinor, gidId, gidOf } from "../../stores/domain/Mirror.ts"
import { ConnectionGate, missingScope } from "../../stores/domain/Ports.ts"
import { StoreMirror } from "../../stores/Mirror.ts"
import type { Resolution } from "../domain/Rules.ts"
import {
  DISCOUNT_CODE_CREATE,
  DRAFT_ORDER_COMPLETE,
  DRAFT_ORDER_CREATE,
  GIFT_CARD_CREATE,
  isTaken,
  RETURN_APPROVE,
  RETURN_DECLINE,
  type StoredResolution
} from "../domain/Shopify.ts"

/*
 * A return's side in Shopify (M9.3), as the steps of `ShopifyWriteWorkflow` make it durable once the undo window has
 * passed: a resolution made there (a gift card for the amount with its bonus, a single-use discount code for the
 * shopper, or a draft order for the new item completed into the exchange or replacement order), and a return that came
 * from Shopify approved or declined there. Inside the return's workspace (`CurrentWorkspace`), as `system`.
 *
 * Idempotent: a resolution is made only while it is asked for (`requested`), under the code Insyte made when it was
 * settled, so a step tried again after Shopify made it finds the code taken and counts it made; a draft order's id is
 * kept the moment it exists, so a retried step completes that one. Shopify refusing (its user errors, a 4xx) is final
 * and recorded on the return with the reason; a scope the store has not granted (`ACCESS_DENIED`) is recorded as such,
 * so the console can say what to do; Shopify unreachable or throttled fails the step, which retries. Once made, the
 * shopper hears what they get (`return.resolved`).
 */

const gid = (type: string, id: string) => `gid://shopify/${type}/${id}`

type Errors = ReadonlyArray<{ readonly message: string; readonly code?: string | null }>

/** What the team reads when the store's token may not do it yet: the store approves the app's new scopes. */
const SCOPE_REASON: Readonly<Record<string, string>> = {
  write_gift_cards: "Insyte mag nog geen cadeaubonnen maken in deze winkel",
  write_returns: "Insyte mag nog geen retouren afhandelen in deze winkel",
  write_discounts: "Insyte mag nog geen kortingscodes maken in deze winkel",
  write_draft_orders: "Insyte mag nog geen bestellingen maken in deze winkel"
}

const scopeReason = (scope: string) => SCOPE_REASON[scope] ?? `Insyte mist de toestemming ${scope} in deze winkel`

interface Target {
  readonly number: string
  readonly status: string
  readonly resolution: Resolution | null
  readonly resolutionMinor: string | null
  readonly shopify: string | null
  readonly currency: string
  readonly exchangeTo: string | null
  readonly customerEmail: string | null
  readonly storeId: string
  readonly connectionId: string
  readonly shop: string
  readonly storeStatus: string
  readonly storeCurrency: string | null
  readonly customerShopifyId: string | null
  readonly shipping: string | null
  readonly shopifyReturnId: string | null
  readonly rejectedReason: string | null
}

const target = (sql: SqlClient.SqlClient, id: string) =>
  sql<Target>`
    select r.number, r.status, r.resolution, r.resolution_minor, r.resolution_shopify::text as shopify, r.currency,
           r.exchange_to, r.customer_email, r.store_id, s.connection_id, s.shop_domain as shop,
           s.status as store_status, s.currency as store_currency, c.shopify_id as customer_shopify_id,
           o.shipping_address::text as shipping, r.shopify_return_id, r.rejected_reason
    from returns r join stores s on s.id = r.store_id join orders o on o.id = r.order_id
    left join customers c on c.id = r.customer_id
    where r.id = ${id}`

/** A line in the return's history, by Insyte. */
const history = (sql: SqlClient.SqlClient, returnId: string, text: string) =>
  sql`insert into return_events (id, workspace_id, return_id, actor, name, kind, text)
      values (${mintId("rev")}, app_workspace_id(), ${returnId}, 'insyte', null, 'note', ${text})`

/** Shopify's MailingAddressInput from the mirror's address: a region sent only where it is a code. */
const mailingAddress = (a: Record<string, string | null>) => {
  const [first, ...rest] = (a["name"] ?? "").trim().split(/\s+/)
  const region = a["region"] ?? ""
  return {
    address1: a["line1"],
    address2: a["line2"],
    city: a["city"],
    zip: a["postcode"],
    countryCode: a["country"],
    ...(/^[A-Z0-9]{1,3}$/.test(region) ? { provinceCode: region } : {}),
    ...(first === undefined || first === "" ? {} : { firstName: first, lastName: rest.join(" ") }),
    ...(a["phone"] ? { phone: a["phone"] } : {})
  }
}

/** What a step made, or why Shopify would not. */
type Made =
  | { readonly made: Partial<StoredResolution> }
  | { readonly failed: string; readonly scope?: string | undefined }

const MADE_TEXT: Record<Exclude<Resolution, "refund">, string> = {
  gift_card: "Cadeaubon gemaakt in Shopify",
  discount: "Kortingscode gemaakt in Shopify",
  exchange: "Ruilbestelling gemaakt in Shopify",
  replacement: "Vervangende bestelling gemaakt in Shopify"
}

const FAILED_TEXT: Record<Exclude<Resolution, "refund">, string> = {
  gift_card: "De cadeaubon kon niet worden gemaakt in Shopify",
  discount: "De kortingscode kon niet worden gemaakt in Shopify",
  exchange: "De ruilbestelling kon niet worden gemaakt in Shopify",
  replacement: "De vervangende bestelling kon niet worden gemaakt in Shopify"
}

/** Shopify's user errors, as the reason it would not. */
const refusal = (errors: Errors): Made => ({ failed: errors.map((e) => e.message).join("; ") })

/** The new item's lines: the same variant again, or for an exchange the first line's product in the asked variant. */
const draftLines = Effect.fn("Returns.draftLines")(function*(sql: SqlClient.SqlClient, id: string, t: Target) {
  const lines = yield* sql<
    { quantity: number; productId: string | null; variantShopifyId: string | null; priceMinor: string }
  >`
    select rl.quantity, ol.product_id, coalesce(v.shopify_id, ol.variant_shopify_id) as variant_shopify_id,
           coalesce(v.price_minor, ol.unit_price_minor) as price_minor
    from return_lines rl join order_lines ol on ol.id = rl.order_line_id left join variants v on v.id = ol.variant_id
    where rl.return_id = ${id} order by rl.id`
  if (lines.length === 0 || lines.some((l) => l.variantShopifyId === null)) {
    return { missing: "De artikelen staan niet (meer) in Shopify" } as const
  }
  const out = lines.map((l) => ({
    variant: l.variantShopifyId!,
    quantity: l.quantity,
    priceMinor: Number(l.priceMinor)
  }))
  if (t.resolution !== "exchange" || t.exchangeTo === null) return { lines: out } as const
  const [first] = lines
  const [to] = first!.productId === null ? [] : yield* sql<{ shopifyId: string; priceMinor: string }>`
    select shopify_id, price_minor from variants
    where product_id = ${first!.productId} and (id = ${t.exchangeTo} or lower(title) = lower(${t.exchangeTo}))
    order by position limit 1`
  if (to === undefined) return { missing: `Bij dit product staat geen variant “${t.exchangeTo}” in Shopify` } as const
  return {
    lines: [{ variant: to.shopifyId, quantity: first!.quantity, priceMinor: Number(to.priceMinor) }, ...out.slice(1)]
  } as const
})

/** The gift card, the code, or the draft order and the order it became; what Shopify said where it would not. */
const make = Effect.fn("Returns.makeInShopify")(function*(id: string, t: Target, stored: StoredResolution) {
  const db = yield* Db
  const store = { connectionId: t.connectionId, shop: t.shop }
  const currency = t.storeCurrency ?? t.currency
  const amount = fromMinor(stored.amountMinor ?? Number(t.resolutionMinor ?? 0), currency)
  switch (t.resolution) {
    case "gift_card": {
      const input = { initialValue: amount, code: stored.code, note: `Retour ${t.number}` }
      const { data, errors } = yield* mutate(store, GIFT_CARD_CREATE, { input }, "giftCardCreate")
      // Taken: Insyte made it on an earlier try of this step, under this return's own code.
      if (errors.length > 0 && !isTaken(errors as Errors)) return refusal(errors as Errors)
      const card = (data as { giftCardCreate?: { giftCard?: { id: string } | null } })?.giftCardCreate?.giftCard
      return { made: card === null || card === undefined ? {} : { shopifyId: gidId(card.id) } } satisfies Made
    }
    case "discount": {
      const basicCodeDiscount = {
        title: `Retour ${t.number}`,
        code: stored.code,
        startsAt: new Date().toISOString(),
        usageLimit: 1,
        appliesOncePerCustomer: true,
        context: t.customerShopifyId === null
          ? { all: "ALL" }
          : { customers: { add: [gid("Customer", t.customerShopifyId)] } },
        customerGets: { value: { discountAmount: { amount, appliesOnEachItem: false } }, items: { all: true } },
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true }
      }
      const { data, errors } = yield* mutate(
        store,
        DISCOUNT_CODE_CREATE,
        { basicCodeDiscount },
        "discountCodeBasicCreate"
      )
      if (errors.length > 0 && !isTaken(errors as Errors)) return refusal(errors as Errors)
      const node = (data as { discountCodeBasicCreate?: { codeDiscountNode?: { id: string } | null } })
        ?.discountCodeBasicCreate?.codeDiscountNode
      return { made: node === null || node === undefined ? {} : { shopifyId: gidId(node.id) } } satisfies Made
    }
    case "exchange":
    case "replacement": {
      const fee = t.resolution === "exchange" ? Number(t.resolutionMinor ?? 0) : 0
      let draftId = stored.draftId
      if (draftId === undefined) {
        const picked = yield* db.scopedFor((sql) => draftLines(sql, id, t))
        if ("missing" in picked) return { failed: picked.missing } satisfies Made
        const wanted: ReadonlyArray<{ variant: string; quantity: number; priceMinor: number }> = picked.lines
        const total = wanted.reduce((n, l) => n + l.quantity * l.priceMinor, 0)
        const shipping = t.shipping === null ? null : JSON.parse(t.shipping) as Record<string, string | null>
        const input = {
          lineItems: wanted.map((l) => ({ variantId: gid("ProductVariant", l.variant), quantity: l.quantity })),
          ...(t.customerShopifyId === null ? {} : { customerId: gid("Customer", t.customerShopifyId) }),
          ...(t.customerEmail === null ? {} : { email: t.customerEmail }),
          ...(shipping === null ? {} : { shippingAddress: mailingAddress(shipping) }),
          note: `${t.resolution === "exchange" ? "Ruil" : "Vervanging"} voor retour ${t.number}`,
          tags: ["retour", t.number],
          // Free but for the exchange fee: the shopper pays only that.
          appliedDiscount: fee <= 0
            ? { valueType: "PERCENTAGE", value: 100, title: `Retour ${t.number}` }
            : {
              valueType: "FIXED_AMOUNT",
              value: Number(fromMinor(Math.max(0, total - fee), currency)),
              title: `Retour ${t.number}`
            }
        }
        const created = yield* mutate(store, DRAFT_ORDER_CREATE, { input }, "draftOrderCreate")
        if (created.errors.length > 0) return refusal(created.errors as Errors)
        const draft = (created.data as { draftOrderCreate?: { draftOrder?: { id: string } | null } })
          ?.draftOrderCreate?.draftOrder
        if (draft === null || draft === undefined) {
          return { failed: "Shopify gaf geen conceptbestelling terug" } satisfies Made
        }
        draftId = gidId(draft.id)
        // Kept now: a step tried again completes this draft instead of making a second one.
        const kept = { ...stored, draftId }
        yield* db.scopedFor((sql) =>
          sql`update returns set resolution_shopify = ${JSON.stringify(kept)}::jsonb where id = ${id}`
        )
      }
      const completed = yield* mutate(
        store,
        DRAFT_ORDER_COMPLETE,
        { id: gid("DraftOrder", draftId), ...(fee > 0 ? { paymentPending: true } : {}) },
        "draftOrderComplete"
      )
      if (completed.errors.length > 0) return refusal(completed.errors as Errors)
      const order = (completed.data as {
        draftOrderComplete?: { draftOrder?: { order?: { id: string; name: string } | null } | null }
      })?.draftOrderComplete?.draftOrder?.order
      if (order === null || order === undefined) return { failed: "Shopify maakte geen bestelling van het concept" }
      // Mirrored now where Shopify has it; the mirror links it to the return (`linkReplacements`), else its webhook will.
      yield* (yield* StoreMirror).mirrorOne(
        { id: t.storeId, connectionId: t.connectionId, shop: t.shop, currency: t.storeCurrency },
        "Order",
        gidOf("Order", gidId(order.id))
      ).pipe(Effect.catchCause((cause) => Effect.logWarning("the new order is not mirrored yet", { cause })))
      return { made: { draftId, orderId: gidId(order.id), orderName: order.name } } satisfies Made
    }
    default:
      return { failed: "Een terugbetaling gaat via de bestelling" } satisfies Made
  }
})

/** Records what the step made (and tells the shopper), or why not; once, while it is still asked for. */
const settle = (id: string, t: Target, made: Made) =>
  Effect.gen(function*() {
    const db = yield* Db
    const workspace = yield* CurrentWorkspace
    const kind = t.resolution as Exclude<Resolution, "refund">
    const told = yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [now] = yield* sql<{ shopify: string | null }>`
          select resolution_shopify::text as shopify from returns where id = ${id} for update`
        const current = now?.shopify === null || now?.shopify === undefined
          ? null
          : JSON.parse(now.shopify) as StoredResolution
        if (current?.state !== "requested") return null
        const next: StoredResolution = "made" in made
          ? { ...current, ...made.made, state: "done" }
          : {
            ...current,
            state: "failed",
            reason: made.failed.slice(0, 300),
            ...(made.scope === undefined ? {} : { scope: made.scope })
          }
        yield* sql`update returns set resolution_shopify = ${JSON.stringify(next)}::jsonb where id = ${id}`
        if ("made" in made) {
          yield* history(sql, id, made.made.orderName ? `${MADE_TEXT[kind]}: ${made.made.orderName}` : MADE_TEXT[kind])
          yield* Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
            action: "return.resolution_made",
            subjectType: "return",
            subjectId: id,
            diff: { resolution: kind, shopifyId: next.shopifyId ?? next.orderId ?? null }
          })
          return yield* Outbox.write(sql, workspace.id, {
            type: "return.resolved",
            workspaceId: workspace.id,
            userId: "system",
            returnIds: [id]
          })
        }
        yield* history(sql, id, `${FAILED_TEXT[kind]}: ${made.failed}`)
        yield* Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
          action: "return.shopify_refused",
          subjectType: "return",
          subjectId: id,
          diff: { resolution: kind, reason: made.failed.slice(0, 300), scope: made.scope ?? null }
        })
        return null
      })
    )
    if (told !== null) yield* (yield* Relay).kick([told])
  })

/** A return's resolution made in Shopify; answers what became of it. */
export const resolutionWriteBack = Effect.fn("Returns.resolutionWriteBack")(function*(returnId: string) {
  const db = yield* Db
  const [t] = yield* db.scopedFor((sql) => target(sql, returnId))
  const outcome = (o: WriteOutcome["outcome"], reason: string | null = null): WriteOutcome => ({
    id: returnId,
    outcome: o,
    reason
  })
  if (t === undefined || t.shopify === null || t.resolution === null || t.resolution === "refund") {
    return outcome("skipped", "gone")
  }
  const stored = JSON.parse(t.shopify) as StoredResolution
  // Made already (a step retried after it was recorded), or undone since: nothing to do.
  if (stored.state !== "requested" || t.status !== "resolved") return outcome("skipped", stored.state)
  if (t.storeStatus !== "connected" && t.storeStatus !== "connecting") {
    yield* settle(returnId, t, { failed: "De winkel is niet meer gekoppeld" })
    return outcome("skipped", "disconnected")
  }
  const made: Made = yield* make(returnId, t, stored).pipe(
    Effect.catchTags({
      TokenRefused: () => Effect.succeed<Made>({ failed: "De winkel is niet meer gekoppeld" }),
      ShopifyRefused: (error) => {
        const scope = missingScope(error)
        if (scope !== undefined) return Effect.succeed<Made>({ failed: scopeReason(scope), scope })
        if (isAnswer(error)) return Effect.succeed<Made>({ failed: error.reason })
        return Effect.flatMap(
          error.status === 401
            ? Effect.flatMap(Effect.service(ConnectionGate), (gate) => gate.forget(t.connectionId))
            : Effect.void,
          () => Effect.fail(error)
        )
      }
    })
  )
  yield* settle(returnId, t, made)
  return "made" in made ? outcome("sent") : outcome("refused", made.scope ?? made.failed)
})

/** The Workflow gave up on Shopify (unreachable through every retry): the resolution failed, to be asked again. */
export const resolutionFailed = Effect.fn("Returns.resolutionFailed")(function*(returnId: string, reason: string) {
  const db = yield* Db
  const [t] = yield* db.scopedFor((sql) => target(sql, returnId))
  if (t === undefined || t.shopify === null || t.resolution === null || t.resolution === "refund") return
  yield* settle(returnId, t, { failed: reason })
})

/**
 * A return that came from Shopify, approved or declined there as Insyte decided it (M9.3), without Shopify's own mail
 * to the shopper: Insyte writes it. Skipped when the return moved on since (reopened, or approved after all).
 */
export const decisionWriteBack = Effect.fn("Returns.decisionWriteBack")(function*(
  decision: "approve" | "decline",
  returnId: string
) {
  const db = yield* Db
  const workspace = yield* CurrentWorkspace
  const [t] = yield* db.scopedFor((sql) => target(sql, returnId))
  const outcome = (o: WriteOutcome["outcome"], reason: string | null = null): WriteOutcome => ({
    id: returnId,
    outcome: o,
    reason
  })
  if (t === undefined || t.shopifyReturnId === null) return outcome("skipped", "gone")
  const still = decision === "decline" ? t.status === "rejected" : t.status !== "review" && t.status !== "rejected"
  if (!still) return outcome("skipped", "moved")
  if (t.storeStatus !== "connected" && t.storeStatus !== "connecting") return outcome("skipped", "disconnected")
  const store = { connectionId: t.connectionId, shop: t.shop }
  const id = gid("Return", t.shopifyReturnId)
  const sent = decision === "approve"
    ? mutate(store, RETURN_APPROVE, { input: { id, notifyCustomer: false } }, "returnApproveRequest")
    : mutate(store, RETURN_DECLINE, {
      input: {
        id,
        declineReason: "OTHER",
        declineNote: (t.rejectedReason ?? "").slice(0, 500),
        notifyCustomer: false
      }
    }, "returnDeclineRequest")
  const refused: { reason: string; scope?: string } | null = yield* sent.pipe(
    Effect.map(({ errors }) => errors.length === 0 ? null : { reason: errors.map((e) => e.message).join("; ") }),
    Effect.catchTags({
      TokenRefused: () => Effect.succeed({ reason: "De winkel is niet meer gekoppeld" }),
      ShopifyRefused: (error) => {
        const scope = missingScope(error)
        if (scope !== undefined) return Effect.succeed({ reason: scopeReason(scope), scope })
        if (isAnswer(error)) return Effect.succeed({ reason: error.reason })
        return Effect.fail(error)
      }
    })
  )
  if (refused === null) return outcome("sent")
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* history(
        sql,
        returnId,
        `Shopify nam de ${decision === "approve" ? "goedkeuring" : "afwijzing"} niet over: ${refused.reason}`
      )
      yield* Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
        action: "return.shopify_refused",
        subjectType: "return",
        subjectId: returnId,
        diff: { decision, reason: refused.reason.slice(0, 300), scope: refused.scope ?? null }
      })
    })
  )
  return outcome("refused", refused.scope ?? refused.reason)
})

/**
 * Orders the mirror wrote (M9.3, `MirrorFollowers`): an exchange or replacement order Shopify made for a return is
 * linked to it (`returns.replacement_order_id`), whether it came in right away or with its webhook.
 */
export const linkReplacements = (sql: SqlClient.SqlClient, storeId: string, orderShopifyIds: ReadonlyArray<string>) =>
  orderShopifyIds.length === 0 ? Effect.void : Effect.asVoid(sql`
    update returns r set replacement_order_id = o.id
    from orders o
    where o.store_id = ${storeId} and o.shopify_id in ${sql.in([...orderShopifyIds])}
      and r.store_id = ${storeId} and r.replacement_order_id is null
      and r.resolution_shopify ->> 'orderId' = o.shopify_id`)
