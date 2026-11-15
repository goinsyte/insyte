import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { Relay } from "../../shared/domain/Outbox.ts"
import { type CreateRefusal, refusalOf } from "../../shared/domain/ShopifyCreates.ts"
import type { ShopifyWrite, WriteOutcome } from "../../shared/domain/ShopifyWrites.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { isAnswer, mutate } from "../../stores/domain/Gate.ts"
import { fromMinor, gidId } from "../../stores/domain/Mirror.ts"
import { ConnectionGate, missingScope, type ShopifyRefused } from "../../stores/domain/Ports.ts"
import { type CreateDraftInput, OrderChange } from "../domain/Commands.ts"
import { DRAFT_CREATE, DRAFT_DELETE, DRAFT_PREFIX } from "../domain/WriteBack.ts"
import { audit, lock, RESTORE, rowsOf } from "./commands.ts"

/*
 * Draft orders (M7.1; widgets/03 "Nieuwe bestelling", domain.md §4.4). "Conceptbestelling aanmaken" makes the draft in
 * Insyte at once, in the chosen store and only one the principal reaches, numbered `SO-…` from the workspace's order
 * counter, with Undo; Shopify gets it as a draft order once the undo window has passed (`draftOrderCreate`), and the
 * row then carries Shopify's draft (`draft-<id>`). Shopify refusing removes it again, since it never existed there,
 * and whoever made it hears why. A draft is not yet an order: no payment, no forwarding, no figures (`is_draft`), and
 * the order commands refuse it. Completing it is Shopify's (the invoice, or "Betaling markeren"): the real order
 * arrives through the webhooks and the draft gives way to it (`stores/use-cases/webhooks.ts`). Removing a draft
 * deletes it in Shopify at once.
 */

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i

interface Store {
  readonly id: string
  readonly status: string
  readonly currency: string | null
}

interface Variant {
  readonly id: string
  readonly productId: string
  readonly title: string
  readonly productTitle: string
  readonly shopifyId: string
  readonly priceMinor: string
}

/** "Conceptbestelling aanmaken": the draft in Insyte now, in Shopify once the window has passed. */
export const createDraft = Effect.fn("Orders.createDraft")(function*(input: typeof CreateDraftInput.Type) {
  yield* Policy.require("orders", 2)
  const name = input.customer.name.trim()
  const email = input.customer.email.trim()
  const lines = input.lines.map((l) => ({ ...l, sku: l.sku.trim(), title: l.title.trim() }))
  const wrong: Record<string, string> = {}
  if (name === "") wrong["customer.name"] = "required"
  if (email === "") wrong["customer.email"] = "required"
  else if (!EMAIL.test(email)) wrong["customer.email"] = "format"
  if (lines.some((l) => l.title === "" && l.sku === "")) wrong["lines"] = "empty"
  if (Object.keys(wrong).length > 0) return yield* new Invalid({ fields: wrong })
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId: sent } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      // A store outside the principal's own is not there for them.
      const [store] = yield* sql<Store>`
        select s.id, s.status, s.currency from stores s where ${yield* inScope(sql, "s.id", input.storeId)}`
      if (store === undefined) return yield* new NotFound({ entity: "store", id: input.storeId })
      if (store.status !== "connected" && store.status !== "connecting") {
        return yield* new Conflict({ entity: "store", reason: "disconnected" })
      }
      // A line with a SKU is that variant of the store; a SKU it does not sell is a typing error, not a new item.
      const found: Array<Variant | null> = []
      for (const [i, line] of lines.entries()) {
        if (line.sku === "") {
          found.push(null)
          continue
        }
        const [variant] = yield* sql<Variant>`
          select v.id, v.product_id, v.title, p.title as product_title, v.shopify_id, v.price_minor
          from variants v join products p on p.id = v.product_id
          where v.store_id = ${store.id} and lower(v.sku) = lower(${line.sku}) and p.shopify_id not like 'insyte-%'
          order by v.position limit 1`
        if (variant === undefined) wrong[`lines.${i}.sku`] = "unknown"
        found.push(variant ?? null)
      }
      if (Object.keys(wrong).length > 0) return yield* new Invalid({ fields: wrong })

      const [customer] = yield* sql<{ id: string; shopifyId: string }>`
        select id, shopify_id from customers
        where store_id = ${store.id} and lower(email) = ${email.toLowerCase()} and deleted_at is null
          and merged_into is null
        order by shopify_id like 'insyte-%', id limit 1`
      const [counter] = yield* sql<{ n: string }>`
        insert into workspace_counters (workspace_id, kind, next) values (${principal.workspaceId}, 'order', 2)
        on conflict (workspace_id, kind) do update set next = workspace_counters.next + 1
        returning next - 1 as n`
      const id = mintId("ord")
      const number = `SO-${10000 + Number(counter!.n)}`
      const priced = lines.map((l, i) => {
        const variant = found[i] ?? null
        return {
          ...l,
          variant,
          title: l.title || (variant === null ? l.sku : variant.productTitle),
          unitPriceMinor: l.unitPriceMinor > 0 || variant === null ? l.unitPriceMinor : Number(variant.priceMinor)
        }
      })
      const subtotal = priced.reduce((n, l) => n + l.quantity * l.unitPriceMinor, 0)
      const currency = store.currency ?? "EUR"
      yield* sql`
        insert into orders (id, workspace_id, store_id, shopify_id, number, customer_id, customer_shopify_id,
                            customer_name, customer_email, status, payment_status, fulfillment_status, total_minor,
                            subtotal_minor, shipping_minor, tax_minor, discounts_minor, currency, payment_gateway,
                            placed_at, is_draft, external_updated_at)
        values (${id}, ${principal.workspaceId}, ${store.id}, ${`insyte-${id}`}, ${number}, ${customer?.id ?? null},
                ${customer === undefined || customer.shopifyId.startsWith("insyte-") ? null : customer.shopifyId},
                ${name}, ${email}, 'placed', 'pending', 'unfulfilled', ${subtotal}, ${subtotal}, 0, 0, 0,
                ${currency}, ${input.payment}, now(), true, now())`
      for (const l of priced) {
        const lineId = mintId("orl")
        yield* sql`
          insert into order_lines (id, workspace_id, store_id, order_id, shopify_id, product_id, variant_id,
                                   variant_shopify_id, sku, title, variant_title, quantity, unit_price_minor)
          values (${lineId}, ${principal.workspaceId}, ${store.id}, ${id}, ${`insyte-${lineId}`},
                  ${l.variant?.productId ?? null}, ${l.variant?.id ?? null}, ${l.variant?.shopifyId ?? null},
                  ${l.sku || null}, ${l.title}, ${l.variant?.title ?? null}, ${l.quantity}, ${l.unitPriceMinor})`
      }
      const note = input.note.trim()
      if (note !== "") {
        yield* sql`insert into order_notes (order_id, workspace_id, body, updated_by)
                   values (${id}, ${principal.workspaceId}, ${note}, ${principal.id})`
      }
      // The shopper's name and address stay out of the audit diff: personal data is read where it lives.
      yield* audit(sql, "order.draft_created", id, { number, lines: priced.length, totalMinor: subtotal })
      const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
        type: "order.draft_created",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        orderIds: [id]
      }, { afterSeconds: UNDO_SECONDS })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { orders: [], draft: id },
        outboxIds: [outboxId]
      })
      return { change: new OrderChange({ orders: yield* rowsOf(sql, [id]), undo }), outboxId }
    })
  )
  yield* relay.kick([sent], { afterSeconds: UNDO_SECONDS })
  return change
})

/** A draft removed: gone from Insyte at once, and from Shopify where it got there (no undo: the toast's is creating's). */
export const removeDraft = Effect.fn("Orders.removeDraft")(function*(id: string) {
  yield* Policy.require("orders", 2)
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const sent = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [locked] = yield* lock(sql, [id], true)
      if (!locked!.isDraft) return yield* new Conflict({ entity: "order", reason: "not_draft" })
      const [row] = yield* sql<{ shopifyId: string; storeId: string; number: string }>`
        delete from orders where id = ${id} returning shopify_id, store_id, number`
      yield* audit(sql, "order.draft_removed", id, { number: row!.number })
      // Still waiting out its window: the create finds it gone and sends nothing.
      if (!row!.shopifyId.startsWith(DRAFT_PREFIX)) return null
      return yield* Outbox.write(sql, principal.workspaceId, {
        type: "order.draft_removed",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        orderIds: [id],
        storeId: row!.storeId,
        draftId: row!.shopifyId.slice(DRAFT_PREFIX.length)
      })
    })
  )
  if (sent !== null) yield* relay.kick([sent])
})

type DraftWrite = Extract<ShopifyWrite, { type: "order.draft_created" | "order.draft_removed" }>

interface Target {
  readonly storeId: string
  readonly connectionId: string
  readonly shop: string
  readonly storeStatus: string
}

interface Draft {
  readonly shopifyId: string
  readonly number: string
  readonly currency: string
  readonly customerEmail: string | null
  readonly customerShopifyId: string | null
  readonly lines: ReadonlyArray<{
    readonly title: string
    readonly sku: string | null
    readonly quantity: number
    readonly unitPriceMinor: number
    readonly variantShopifyId: string | null
  }>
}

type Errors = ReadonlyArray<{ readonly field?: ReadonlyArray<string> | null; readonly message: string }>

/** Shopify's draft for the lines Insyte holds: a variant at the price on the draft, else a line of its own. */
const draftInput = (d: Draft) => ({
  ...(d.customerEmail === null ? {} : { email: d.customerEmail }),
  ...(d.customerShopifyId === null ? {} : { customerId: `gid://shopify/Customer/${d.customerShopifyId}` }),
  lineItems: d.lines.map((l) => {
    const price = { amount: fromMinor(Number(l.unitPriceMinor), d.currency), currencyCode: d.currency }
    return l.variantShopifyId === null
      ? {
        title: l.title,
        quantity: l.quantity,
        ...(l.sku === null ? {} : { sku: l.sku }),
        originalUnitPriceWithCurrency: price
      }
      : { variantId: `gid://shopify/ProductVariant/${l.variantShopifyId}`, quantity: l.quantity, priceOverride: price }
  }),
  tags: ["insyte", d.number]
})

/**
 * One draft's way to Shopify, a step of the `ShopifyWrite` Workflow: made once the window has passed (the row takes
 * Shopify's draft), or deleted. Throttled or unreachable, the step retries; refused, a new draft leaves Insyte again.
 */
export const draftWriteBack = Effect.fn("Orders.draftWriteBack")(function*(write: DraftWrite, orderId: string) {
  const db = yield* Db
  const outcome = (o: WriteOutcome["outcome"], reason: string | null = null): WriteOutcome => ({
    id: orderId,
    outcome: o,
    reason
  })
  const storeId = write.type === "order.draft_removed"
    ? write.storeId
    : (yield* db.scopedFor((sql) => sql<{ storeId: string }>`select store_id from orders where id = ${orderId}`))[0]
      ?.storeId
  if (storeId === undefined) return outcome("skipped", "gone")
  const [target] = yield* db.scopedFor((sql) =>
    sql<Target>`select id as store_id, connection_id, shop_domain as shop, status as store_status
                from stores where id = ${storeId}`
  )
  if (target === undefined) return outcome("skipped", "gone")
  if (target.storeStatus !== "connected" && target.storeStatus !== "connecting") {
    return outcome("skipped", "disconnected")
  }
  const draft = write.type === "order.draft_created"
    ? (yield* db.scopedFor((sql) =>
      sql<Draft>`
        select o.shopify_id, o.number, o.currency, o.customer_email, o.customer_shopify_id,
               coalesce((select json_agg(json_build_object('title', l.title, 'sku', l.sku, 'quantity', l.quantity,
                                                           'unitPriceMinor', l.unit_price_minor,
                                                           'variantShopifyId', l.variant_shopify_id) order by l.id)
                         from order_lines l where l.order_id = o.id), '[]') as lines
        from orders o where o.id = ${orderId} and o.is_draft`
    ))[0]
    : undefined
  if (write.type === "order.draft_created") {
    // Gone (undone, removed) or already made (a step tried again after Shopify answered): nothing to send.
    if (draft === undefined) return outcome("skipped", "gone")
    if (!draft.shopifyId.startsWith("insyte-")) return outcome("sent")
  }

  const send: Effect.Effect<Errors, unknown, unknown> = Effect.gen(function*() {
    if (write.type === "order.draft_removed") {
      const input = { id: `gid://shopify/DraftOrder/${write.draftId}` }
      return (yield* mutate(target, DRAFT_DELETE, { input }, "draftOrderDelete")).errors as Errors
    }
    const created = yield* mutate(target, DRAFT_CREATE, { input: draftInput(draft!) }, "draftOrderCreate")
    if (created.errors.length > 0) return created.errors as Errors
    const made = (created.data as { draftOrderCreate?: { draftOrder?: { id: string } | null } })?.draftOrderCreate
      ?.draftOrder
    if (made !== null && made !== undefined) {
      yield* db.scopedFor((sql) =>
        sql`update orders set shopify_id = ${`${DRAFT_PREFIX}${gidId(made.id)}`}, external_updated_at = now()
            where id = ${orderId} and shopify_id like 'insyte-%'`
      )
    }
    return []
  })

  const refused = yield* send.pipe(
    Effect.map((errors): { reason: CreateRefusal; text: string } | null =>
      errors.length === 0 ? null : { reason: refusalOf(errors), text: errors.map((e) => e.message).join("; ") }
    ),
    Effect.catchTags({
      TokenRefused: () => Effect.succeed("disconnected" as const),
      ShopifyRefused: (error: ShopifyRefused) => {
        const scope = missingScope(error)
        if (scope !== undefined) return Effect.succeed({ reason: "scope" as const, text: scope })
        return isAnswer(error)
          ? Effect.succeed({ reason: refusalOf([{ message: error.reason }]), text: error.reason })
          : Effect.flatMap(
            error.status === 401
              ? Effect.flatMap(Effect.service(ConnectionGate), (gate) => gate.forget(target.connectionId))
              : Effect.void,
            () => Effect.fail(error)
          )
      }
    })
  )
  if (refused === null) return outcome("sent")
  if (refused === "disconnected") return outcome("skipped", "disconnected")

  const workspace = yield* CurrentWorkspace
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const change = write.type === "order.draft_created" ? "draft" : "draft_delete"
      if (write.type === "order.draft_created") {
        // Never made in Shopify: it leaves Insyte again, its lines and note with it.
        const gone = yield* sql`delete from orders where id = ${orderId} and shopify_id like 'insyte-%' returning id`
        if (gone.length > 0) {
          yield* Outbox.write(sql, workspace.id, {
            type: "shopify.create_refused",
            workspaceId: workspace.id,
            userId: write.userId,
            subject: "order",
            subjectId: orderId,
            label: draft!.number,
            reason: refused.reason
          })
        }
      }
      yield* Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
        action: "order.shopify_refused",
        subjectType: "order",
        subjectId: orderId,
        diff: { change, reason: refused.reason, shopify: refused.text.slice(0, 300) }
      })
    })
  )
  return outcome("refused", refused.reason)
})
