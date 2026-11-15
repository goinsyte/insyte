import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { Relay } from "../../shared/domain/Outbox.ts"
import { type CreateRefusal, refusalOf } from "../../shared/domain/ShopifyCreates.ts"
import type { CreateSent, ShopifyWrite, WriteOutcome } from "../../shared/domain/ShopifyWrites.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { isAnswer, mutate } from "../../stores/domain/Gate.ts"
import { fromMinor, gidId } from "../../stores/domain/Mirror.ts"
import { ConnectionGate, missingScope, type ShopifyRefused } from "../../stores/domain/Ports.ts"
import { type CreateDraftInput, OrderChange } from "../domain/Commands.ts"
import {
  DRAFT_CREATE,
  DRAFT_DELETE,
  DRAFT_FIND,
  DRAFT_PREFIX,
  type DraftFound,
  draftTagQuery,
  openDrafts
} from "../domain/WriteBack.ts"
import { audit, lock, RESTORE, rowsOf } from "./commands.ts"

/*
 * Draft orders (M7.1; widgets/03 "Nieuwe bestelling", domain.md §4.4). "Conceptbestelling aanmaken" makes the draft in
 * Insyte at once, in the chosen store and only one the principal reaches, numbered `SO-…` from the workspace's order
 * counter, with Undo; Shopify gets it as a draft order once the undo window has passed (`draftOrderCreate`, or the one a
 * try before made, found by its tag), and the row then carries Shopify's draft (`draft-<id>`), in a step of its own.
 * Shopify's search lags behind its writes, so a few minutes later a last look deletes any twin a lagging search let a
 * retry make. Shopify refusing removes it again, since it never existed there, and whoever made it hears why. A draft is not yet an order: no payment, no forwarding, no figures (`is_draft`), and
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
                            subtotal_minor, shipping_minor, tax_minor, discounts_minor, currency, draft_payment,
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
        orderIds: [id],
        storeId: store.id,
        number
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
      // Not Shopify's yet (inside its window, or while Shopify makes it): the create finds it gone and sends nothing,
      // or its adopt step deletes what Shopify made.
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

/** What Shopify made for a draft, in which store: the adopt step's input. */
export interface DraftMade {
  readonly id: string
  readonly storeId: string
}

type DraftCreated = Extract<ShopifyWrite, { type: "order.draft_created" }>
type DraftRemoved = Extract<ShopifyWrite, { type: "order.draft_removed" }>

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
type Refused = { readonly reason: CreateRefusal; readonly text: string }

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

const outcomeOf = (id: string) => (o: WriteOutcome["outcome"], reason: string | null = null): WriteOutcome => ({
  id,
  outcome: o,
  reason
})

/** The draft's store, as a call to its Shopify needs it; `undefined` when it is gone. */
const targetOf = (storeId: string) =>
  Effect.flatMap(Effect.service(Db), (db) =>
    Effect.map(
      db.scopedFor((sql) =>
        sql<Target>`select id as store_id, connection_id, shop_domain as shop, status as store_status
                    from stores where id = ${storeId}`
      ),
      (rows) => rows[0]
    ))

const live = (t: Target) => t.storeStatus === "connected" || t.storeStatus === "connecting"

/**
 * Shopify's 4xx about the draft as a refusal; a scope the store lacks as its own; a token Shopify no longer takes is
 * forgotten; anything else is tried again.
 */
const refusalOf4xx = (t: Target) => (error: ShopifyRefused) => {
  const scope = missingScope(error)
  if (scope !== undefined) return Effect.succeed<Refused>({ reason: "scope", text: scope })
  return isAnswer(error)
    ? Effect.succeed<Refused>({ reason: refusalOf([{ message: error.reason }]), text: error.reason })
    : Effect.flatMap(
      error.status === 401
        ? Effect.flatMap(Effect.service(ConnectionGate), (gate) => gate.forget(t.connectionId))
        : Effect.void,
      () => Effect.fail(error)
    )
}

const refusedOf = (errors: Errors): Refused | null =>
  errors.length === 0 ? null : { reason: refusalOf(errors), text: errors.map((e) => e.message).join("; ") }

/** Shopify's open drafts carrying a draft's number, the newest search Shopify has. */
const tagged = (t: Target, number: string) =>
  Effect.map(mutate(t, DRAFT_FIND, { query: draftTagQuery(number) }, "draftOrders"), ({ data }) => openDrafts(data))

/** As `tagged`, where nothing waits on the answer: a refusal or a token Shopify no longer takes finds none. */
const taggedOrNone = (t: Target, number: string) =>
  tagged(t, number).pipe(Effect.catchTags({
    TokenRefused: () => Effect.succeed<ReadonlyArray<DraftFound>>([]),
    ShopifyRefused: (error) => Effect.as(refusalOf4xx(t)(error), [] as ReadonlyArray<DraftFound>)
  }))

/**
 * A new draft's first step of the `ShopifyWrite` Workflow, once the window has passed: Shopify's draft for it, the one
 * a try before made when there is one (found by the `SO-…` tag it carries), else a new one. Already Shopify's, nothing
 * is sent. Gone (removed after a try whose answer was lost), what that try made is found by its number and deleted.
 * Refused, it leaves Insyte again and whoever made it hears why.
 */
export const draftSend = Effect.fn("Orders.draftSend")(function*(write: DraftCreated, orderId: string) {
  const db = yield* Db
  const outcome = outcomeOf(orderId)
  const [draft] = yield* db.scopedFor((sql) =>
    sql<Draft & { storeId: string }>`
      select o.store_id, o.shopify_id, o.number, o.currency, o.customer_email, o.customer_shopify_id,
             coalesce((select json_agg(json_build_object('title', l.title, 'sku', l.sku, 'quantity', l.quantity,
                                                         'unitPriceMinor', l.unit_price_minor,
                                                         'variantShopifyId', l.variant_shopify_id) order by l.id)
                       from order_lines l where l.order_id = o.id), '[]') as lines
      from orders o where o.id = ${orderId} and o.is_draft`
  )
  if (draft === undefined) return { outcome: yield* dropEarlier(write, orderId) } satisfies CreateSent<DraftMade>
  if (!draft.shopifyId.startsWith("insyte-")) return { outcome: outcome("sent") } satisfies CreateSent<DraftMade>
  const target = yield* targetOf(draft.storeId)
  if (target === undefined) return { outcome: outcome("skipped", "gone") } satisfies CreateSent<DraftMade>
  if (!live(target)) return { outcome: outcome("skipped", "disconnected") } satisfies CreateSent<DraftMade>

  const send = Effect.gen(function*() {
    const [earlier] = yield* tagged(target, draft.number)
    if (earlier !== undefined) return { made: { id: earlier.id, storeId: draft.storeId } }
    const created = yield* mutate(target, DRAFT_CREATE, { input: draftInput(draft) }, "draftOrderCreate")
    const refused = refusedOf(created.errors as Errors)
    if (refused !== null) return { refused }
    const made = (created.data as { draftOrderCreate?: { draftOrder?: { id: string } | null } } | null)
      ?.draftOrderCreate?.draftOrder
    return made === null || made === undefined
      ? { refused: { reason: "other", text: "no draft" } as Refused }
      : { made: { id: made.id, storeId: draft.storeId } }
  })
  const sent = yield* send.pipe(Effect.catchTags({
    TokenRefused: () => Effect.succeed("disconnected" as const),
    ShopifyRefused: (error) => Effect.map(refusalOf4xx(target)(error), (refused) => ({ refused }))
  }))
  if (sent === "disconnected") return { outcome: outcome("skipped", "disconnected") } satisfies CreateSent<DraftMade>
  if ("made" in sent) return { made: sent.made } satisfies CreateSent<DraftMade>

  const workspace = yield* CurrentWorkspace
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      // Never made in Shopify: it leaves Insyte again, its lines and note with it.
      const gone = yield* sql`delete from orders where id = ${orderId} and shopify_id like 'insyte-%' returning id`
      if (gone.length === 0) return
      yield* Outbox.write(sql, workspace.id, {
        type: "shopify.create_refused",
        workspaceId: workspace.id,
        userId: write.userId,
        subject: "order",
        subjectId: orderId,
        label: draft.number,
        reason: sent.refused.reason
      })
      yield* Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
        action: "order.shopify_refused",
        subjectType: "order",
        subjectId: orderId,
        diff: { change: "draft", reason: sent.refused.reason, shopify: sent.refused.text.slice(0, 300) }
      })
    })
  )
  return { outcome: outcome("refused", sent.refused.reason) } satisfies CreateSent<DraftMade>
})

/**
 * The second step: the draft takes Shopify's id. Removed while Shopify made it (Verwijderen, an undo from the agent
 * log), it is deleted there as well, so no draft is left in Shopify that Insyte no longer knows.
 */
export const draftAdopt = Effect.fn("Orders.draftAdopt")(function*(
  _write: DraftCreated,
  orderId: string,
  made: DraftMade
) {
  const db = yield* Db
  const shopifyId = `${DRAFT_PREFIX}${gidId(made.id)}`
  const kept = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ shopifyId: string }>`
        select shopify_id from orders where id = ${orderId} and is_draft for update`
      if (row === undefined) return false
      if (row.shopifyId !== shopifyId) {
        yield* sql`update orders set shopify_id = ${shopifyId}, external_updated_at = now() where id = ${orderId}`
      }
      return true
    })
  )
  if (kept) return outcomeOf(orderId)("sent")
  return yield* dropInShopify(orderId, made.storeId, gidId(made.id), "removed")
})

/**
 * A draft gone from Insyte before its send got through: removed between a try whose answer was lost and the next. What
 * that try made is found by the number the event carries and deleted, so Shopify keeps no draft Insyte does not know.
 */
const dropEarlier = (write: DraftCreated, orderId: string) =>
  Effect.gen(function*() {
    const gone = outcomeOf(orderId)("skipped", "gone")
    if (write.storeId === undefined || write.number === undefined) return gone
    const target = yield* targetOf(write.storeId)
    if (target === undefined || !live(target)) return gone
    for (const d of yield* taggedOrNone(target, write.number)) {
      yield* dropInShopify(orderId, write.storeId, gidId(d.id), "gone")
    }
    return gone
  })

/**
 * The last look, a few minutes after the draft took Shopify's id: Shopify's search caught up, any other open draft with
 * its number is a twin a lagging search let a retry make, and is deleted. Answers how many.
 */
export const draftTwins = Effect.fn("Orders.draftTwins")(function*(
  write: DraftCreated,
  orderId: string,
  made: DraftMade
) {
  const db = yield* Db
  const number = write.number ??
    (yield* db.scopedFor((sql) => sql<{ number: string }>`select number from orders where id = ${orderId}`))[0]
      ?.number
  if (number === undefined) return 0
  const target = yield* targetOf(made.storeId)
  if (target === undefined || !live(target)) return 0
  const twins = (yield* taggedOrNone(target, number)).filter((d) => d.id !== made.id)
  for (const d of twins) yield* dropInShopify(orderId, made.storeId, gidId(d.id), "twin")
  return twins.length
})

/** A draft removed from Insyte after Shopify had it: deleted there at once. */
export const draftRemove = Effect.fn("Orders.draftRemove")(function*(write: DraftRemoved, orderId: string) {
  return yield* dropInShopify(orderId, write.storeId, write.draftId, null)
})

/**
 * Shopify's draft deleted. Shopify not knowing it (deleted in its admin already) is the same; any other refusal is
 * recorded, the step retries what Shopify did not answer.
 */
const dropInShopify = (orderId: string, storeId: string, draftId: string, removed: string | null) =>
  Effect.gen(function*() {
    const db = yield* Db
    const outcome = outcomeOf(orderId)
    const target = yield* targetOf(storeId)
    if (target === undefined) return outcome("skipped", "gone")
    if (!live(target)) return outcome("skipped", "disconnected")
    const input = { id: `gid://shopify/DraftOrder/${draftId}` }
    const deleted = yield* mutate(target, DRAFT_DELETE, { input }, "draftOrderDelete").pipe(
      Effect.map(({ errors }) => refusedOf(errors as Errors)),
      Effect.catchTags({
        TokenRefused: () => Effect.succeed("disconnected" as const),
        ShopifyRefused: refusalOf4xx(target)
      })
    )
    if (deleted === "disconnected") return outcome("skipped", "disconnected")
    if (deleted === null || /does not exist|not found/i.test(deleted.text)) {
      return outcome(removed ? "skipped" : "sent", removed)
    }
    const workspace = yield* CurrentWorkspace
    yield* db.scopedFor((sql) =>
      Audit.write(sql, workspace.id, { kind: "system", id: "shopify" }, {
        action: "order.shopify_refused",
        subjectType: "order",
        subjectId: orderId,
        diff: { change: "draft_delete", reason: deleted.reason, shopify: deleted.text.slice(0, 300) }
      })
    )
    return outcome("refused", deleted.reason)
  })
