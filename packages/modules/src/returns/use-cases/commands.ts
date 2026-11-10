import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { RefundId } from "../../orders/domain/Refunds.ts"
import { type OutboxEvent, Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { Labels, Refunder } from "../domain/Ports.ts"
import {
  type AddTrackingInput,
  type ApproveInput,
  type AssignInput,
  type Before,
  IllegalReturnMove,
  type InspectInput,
  LabelNotPossible,
  LabelsUnavailable,
  LineNotReturnable,
  type RejectInput,
  ResolutionNotAllowed,
  type ResolveInput,
  ReturnChange,
  ReturnsRestore,
  type SendLabelInput,
  type StartInput
} from "../domain/Returns.ts"
import {
  approvedStatus,
  canMove,
  resolutionsFor,
  type ReturnStatus,
  REVIEW_HOURS,
  ruleFor,
  windowCheck,
  windowDaysFor
} from "../domain/Rules.ts"
import { discountCode, giftCardCode, type StoredResolution } from "../domain/Shopify.ts"
import { DELIVERED_AT, freeLines, judge, linesOf, rowsOf, type StoredLabel } from "./returns.ts"
import { load, RESTORE, restoreSettings } from "./settings.ts"

/*
 * The returns commands (M9.1; domain.md §12.17, api.md §2), inside the role's stores. Starting, assigning, receiving
 * and inspecting take Retouren · Bewerken; approving, rejecting, reopening and settling also `returns.approve`. Each
 * applies at once and has one undo token (`returns.restore`) that puts the returns back as they were, with the history
 * rows it added taken away. A resolution that refunds leaves the building: it runs `Orders.refund` on the same
 * transaction, as the same person, within their limit, and has no undo.
 */

interface Locked {
  readonly id: string
  readonly number: string
  readonly type: "return" | "claim"
  readonly orderId: string
  readonly status: ReturnStatus
  readonly assigneeId: string | null
  readonly keepItem: boolean
  readonly rejectedReason: string | null
  readonly receivedAt: Date | null
  readonly inspectedAt: Date | null
  readonly resolution: Before["resolution"]
  readonly resolutionMinor: string | null
  readonly resolvedAt: Date | null
  readonly resolvedBy: string | null
  readonly exchangeTo: string | null
  readonly requestedResolution: NonNullable<Before["resolution"]>
  readonly source: "portal" | "operator" | "agent" | "shopify"
  readonly shopifyReturnId: string | null
}

const lock = Effect.fn("Returns.lock")(function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
  const scope = yield* inScope(sql, "r.store_id")
  const rows = yield* sql<Locked>`
    select r.id, r.number, r.type, r.order_id, r.status, r.assignee_id, r.keep_item, r.rejected_reason, r.received_at,
           r.inspected_at, r.resolution, r.resolution_minor, r.resolved_at, r.resolved_by, r.exchange_to,
           r.requested_resolution, r.source, r.shopify_return_id
    from returns r where r.id in ${sql.in([...new Set(ids)])} and ${scope} order by r.id for update`
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.find((id) => !found.has(id))
  if (missing !== undefined) return yield* new NotFound({ entity: "return", id: missing })
  return rows
})

/** The lines as they were, for an undo of an inspection. */
const lineState = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  sql<{ id: string; returnId: string; condition: Before["lines"][number]["condition"]; restock: boolean }>`
    select id, return_id, condition, restock from return_lines where return_id in ${sql.in([...ids])}`

const before = (l: Locked, events: ReadonlyArray<string>, lines: Before["lines"] = []): Before => ({
  id: l.id,
  status: l.status,
  assigneeId: l.assigneeId,
  keepItem: l.keepItem,
  rejectedReason: l.rejectedReason,
  receivedAt: l.receivedAt?.getTime() ?? null,
  inspectedAt: l.inspectedAt?.getTime() ?? null,
  resolution: l.resolution,
  resolutionMinor: l.resolutionMinor === null ? null : Number(l.resolutionMinor),
  resolvedAt: l.resolvedAt?.getTime() ?? null,
  resolvedBy: l.resolvedBy,
  exchangeTo: l.exchangeTo,
  events,
  lines
})

/** Who did it, as the history says it: the member's name, else nothing (the row reads as the team's). */
const actorName = Effect.fn("Returns.actorName")(function*(sql: SqlClient.SqlClient) {
  const principal = yield* CurrentPrincipal
  if (principal.kind !== "member") return null
  const [m] = yield* sql<{ name: string }>`
    select u.name from members m join auth."user" u on u.id = m.user_id where m.id = ${principal.id}`
  return m?.name ?? null
})

type EventKind =
  | "requested"
  | "approved"
  | "rejected"
  | "reopened"
  | "received"
  | "inspected"
  | "resolved"
  | "assigned"
  | "in_transit"
  | "note"

/** One history row by the principal; answers its id, so an undo can take it away. */
const event = Effect.fn("Returns.event")(function*(
  sql: SqlClient.SqlClient,
  returnId: string,
  kind: EventKind,
  text: string,
  data: Record<string, unknown> = {}
) {
  const principal = yield* CurrentPrincipal
  const id = mintId("rev")
  yield* sql`insert into return_events (id, workspace_id, return_id, actor, name, kind, text, data)
             values (${id}, ${principal.workspaceId}, ${returnId}, 'team', ${yield* actorName(sql)}, ${kind},
                     ${text}, ${JSON.stringify(data)}::jsonb)`
  return id
})

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "return",
        subjectId: id,
        diff
      })
  )

/** The returns as they are now, with the undo that puts them back and cancels the outbox rows the command wrote. */
const answer = (
  sql: SqlClient.SqlClient,
  ids: ReadonlyArray<string>,
  restore: ReturnsRestore | null,
  outboxIds: ReadonlyArray<string> = []
) =>
  Effect.gen(function*() {
    const undo = restore === null
      ? null
      : yield* Undo.issue(sql, { command: RESTORE, compensation: restore, outboxIds })
    return new ReturnChange({ returns: yield* rowsOf(sql, ids), undo })
  })

/**
 * What a command tells the shopper (and Shopify), held back for the undo window and cancelled with the token
 * (M9.3). Kicked onto the queue with the same delay once the transaction has committed.
 */
const held = (
  sql: SqlClient.SqlClient,
  told: Extract<OutboxEvent, { type: "return.started" | "return.approved" | "return.rejected" }>
) => Outbox.write(sql, told.workspaceId, told, { afterSeconds: UNDO_SECONDS })

const kickHeld = (outboxIds: ReadonlyArray<string>) =>
  outboxIds.length === 0
    ? Effect.void
    : Effect.flatMap(Effect.service(Relay), (relay) => relay.kick(outboxIds, { afterSeconds: UNDO_SECONDS }))

const none = () => new ReturnChange({ returns: [], undo: null })

/** The moves that apply to many at once skip the ones that cannot move; a single one that cannot is refused. */
const movable = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>, to: ReturnStatus, move: string) =>
  Effect.gen(function*() {
    const locked = yield* lock(sql, ids)
    const going = locked.filter((l) => canMove(l.status, to))
    if (going.length === 0 && locked.length === 1) {
      return yield* new IllegalReturnMove({ id: locked[0]!.id, from: locked[0]!.status, move })
    }
    return going
  })

const SOURCE = { member: "operator", agent: "agent" } as const

/** The returns that came from Shopify: approving or rejecting them is said there too. */
const fromShopify = (locked: ReadonlyArray<Locked>) =>
  locked.filter((l) => l.source === "shopify" && l.shopifyReturnId !== null).map((l) => l.id)

/**
 * "Retour starten" (StartReturnDialog): the operator starts one for a shopper who called or mailed. It lands in Te
 * beoordelen like a portal request. A line goes back only as far as it is free and its product rule allows a return;
 * outside the window it is still made (the person is the shopper's voice) and says so in the audit and on the record.
 */
export const start = Effect.fn("Returns.start")(function*(input: typeof StartInput.Type) {
  yield* Policy.require("returns", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const { change, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "o.store_id")
      const [order] = yield* sql<{
        id: string
        storeId: string
        customerId: string | null
        customerName: string
        customerEmail: string | null
        country: string | null
        currency: string
        placedAt: Date
        deliveredAt: Date | null
      }>`
        select o.id, o.store_id, o.customer_id, o.customer_name, o.customer_email,
               o.shipping_address ->> 'country' as country, o.currency, o.placed_at,
               ${sql.literal(DELIVERED_AT)} as delivered_at
        from orders o where o.id = ${input.orderId} and ${scope} for update of o`
      if (order === undefined) return yield* new NotFound({ entity: "order", id: input.orderId })
      const s = yield* load(sql)
      const reason = s.reasons.find((r) => r.id === input.reasonId)
      if (reason === undefined) return yield* new Invalid({ fields: { reasonId: "unknown" } })
      const kind = reason.type === "claim" ? "claim" : "return"

      const free = yield* freeLines(sql, order.id)
      for (const want of input.lines) {
        const line = free.find((l) => l.id === want.lineId)
        if (line === undefined) return yield* new LineNotReturnable({ lineId: want.lineId, why: "unknown" })
        if (want.qty > line.quantity - line.taken) {
          return yield* new LineNotReturnable({ lineId: want.lineId, why: "taken" })
        }
        const rule = ruleFor(s.rules, { productId: line.productId, variantId: line.variantId, tags: line.tags ?? [] })
        if (resolutionsFor(s.offered, rule, kind).length === 0) {
          return yield* new LineNotReturnable({ lineId: want.lineId, why: "rule" })
        }
      }
      const first = free.find((l) => l.id === input.lines[0]!.lineId)!
      const rule = ruleFor(s.rules, { productId: first.productId, variantId: first.variantId, tags: first.tags ?? [] })
      if (!resolutionsFor(s.offered, rule, kind).includes(input.requested)) {
        return yield* new ResolutionNotAllowed({ resolution: input.requested })
      }
      const days = windowDaysFor(kind, reason, s, order.placedAt)
      const window = windowCheck(order.deliveredAt, days, Date.now())

      const [counter] = yield* sql<{ n: string }>`
        update workspace_counters set next = next + 1 where kind = 'return' returning next - 1 as n`
      const number = `R-${1000 + Number(counter!.n)}`
      const id = mintId("ret")
      yield* sql`
        insert into returns (id, workspace_id, store_id, number, type, order_id, customer_id, customer_name,
                             customer_email, country, source, status, reason_id, customer_note, requested_resolution,
                             exchange_to, currency, gift_card_bonus_pct, exchange_fee_minor, review_deadline, quality,
                             delivered_at, window_until, outside_window, rule_id, created_by)
        values (${id}, ${principal.workspaceId}, ${order.storeId}, ${number}, ${kind}, ${order.id},
                ${order.customerId}, ${order.customerName}, ${order.customerEmail}, ${order.country},
                ${SOURCE[principal.kind as "member"] ?? "operator"}, 'review', ${reason.id},
                ${input.note?.trim() ?? ""}, ${input.requested}, ${input.exchangeTo?.trim() || null}, ${order.currency},
                ${s.giftCardBonusPct}, ${s.exchangeFeeMinor}, now() + make_interval(hours => ${REVIEW_HOURS}),
                ${reason.countsForQuality}, ${order.deliveredAt}, ${new Date(window.closesOn)}, ${!window.inside},
                ${rule?.id ?? null}, ${principal.id})`
      for (const l of input.lines) {
        yield* sql`insert into return_lines (id, workspace_id, return_id, order_line_id, quantity)
                   values (${mintId("rln")}, ${principal.workspaceId}, ${id}, ${l.lineId}, ${l.qty})`
      }
      yield* event(sql, id, "requested", `${kind === "claim" ? "Claim" : "Retour"} gestart namens de klant`)
      yield* audit(sql, "return.started", id, {
        number,
        orderId: order.id,
        kind,
        reason: reason.id,
        outsideWindow: !window.inside
      })
      // The shopper hears the team started it for them, once Undo can no longer take it away.
      const sent = yield* held(sql, {
        type: "return.started",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        returnIds: [id]
      })
      return { change: yield* answer(sql, [id], { kind: "created", id }, [sent]), outboxIds: [sent] }
    })
  )
  yield* kickHeld(outboxIds)
  return change
})

/** "Goedkeuren": from review to wait for the parcel; a claim that keeps its item ("zonder terugsturen") to settle. */
export const approve = Effect.fn("Returns.approve")(function*(input: typeof ApproveInput.Type) {
  yield* Policy.require("returns", 2)
  yield* Policy.requireAction("returns.approve")
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const { change, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = (yield* lock(sql, input.ids)).filter((l) => l.status === "review")
      if (locked.length === 0) {
        if (input.ids.length === 1) {
          const [one] = yield* lock(sql, input.ids)
          return yield* new IllegalReturnMove({ id: one!.id, from: one!.status, move: "approve" })
        }
        return { change: none(), outboxIds: [] }
      }
      const restore: Array<Before> = []
      for (const l of locked) {
        const keep = input.keepItem === true && l.type === "claim"
        const to = approvedStatus(l.type, keep)
        yield* sql`update returns set status = ${to}, keep_item = ${keep} where id = ${l.id}`
        const ev = yield* event(
          sql,
          l.id,
          "approved",
          keep ? "Goedgekeurd: nieuw artikel zonder terugsturen" : "Goedgekeurd"
        )
        yield* audit(sql, "return.approved", l.id, { to, keepItem: keep })
        restore.push(before(l, [ev]))
      }
      const sent = yield* held(sql, {
        type: "return.approved",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        returnIds: locked.map((l) => l.id),
        toShopify: fromShopify(locked)
      })
      return {
        change: yield* answer(sql, locked.map((l) => l.id), { kind: "fields", returns: restore }, [sent]),
        outboxIds: [sent]
      }
    })
  )
  yield* kickHeld(outboxIds)
  return change
})

/** "Afwijzen", with the reason the shopper reads; in review or still waiting for the parcel. */
export const reject = Effect.fn("Returns.reject")(function*(input: typeof RejectInput.Type) {
  yield* Policy.require("returns", 2)
  yield* Policy.requireAction("returns.approve")
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const { change, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const going = yield* movable(sql, input.ids, "rejected", "reject")
      if (going.length === 0) return { change: none(), outboxIds: [] }
      const reason = input.reason.trim()
      const restore: Array<Before> = []
      for (const l of going) {
        yield* sql`update returns set status = 'rejected', rejected_reason = ${reason} where id = ${l.id}`
        const ev = yield* event(sql, l.id, "rejected", `Afgewezen: ${reason}`)
        yield* audit(sql, "return.rejected", l.id, { reason })
        restore.push(before(l, [ev]))
      }
      // The shopper reads the reason, and a return from Shopify is declined there, once the window has passed.
      const sent = yield* held(sql, {
        type: "return.rejected",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        returnIds: going.map((l) => l.id),
        toShopify: fromShopify(going)
      })
      return {
        change: yield* answer(sql, going.map((l) => l.id), { kind: "fields", returns: restore }, [sent]),
        outboxIds: [sent]
      }
    })
  )
  yield* kickHeld(outboxIds)
  return change
})

/** "Opnieuw beoordelen": a rejected one back in review, with a fresh deadline. */
export const reopen = Effect.fn("Returns.reopen")(function*(id: string) {
  yield* Policy.require("returns", 2)
  yield* Policy.requireAction("returns.approve")
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* movable(sql, [id], "review", "reopen")
      yield* sql`update returns set status = 'review', rejected_reason = null,
                   review_deadline = now() + make_interval(hours => ${REVIEW_HOURS})
                 where id = ${l!.id}`
      const ev = yield* event(sql, l!.id, "reopened", "Opnieuw te beoordelen")
      yield* audit(sql, "return.reopened", l!.id)
      return yield* answer(sql, [l!.id], { kind: "fields", returns: [before(l!, [ev])] })
    })
  )
})

/** "Aan mij toewijzen" / "Weghalen": the member must be one of the workspace's. */
export const assign = Effect.fn("Returns.assign")(function*(input: typeof AssignInput.Type) {
  yield* Policy.require("returns", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      if (input.memberId !== null) {
        const [m] = yield* sql`select 1 from members where id = ${input.memberId} and deactivated_at is null`
        if (m === undefined) return yield* new NotFound({ entity: "member", id: input.memberId })
      }
      const locked = (yield* lock(sql, input.ids)).filter((l) => l.assigneeId !== input.memberId)
      if (locked.length === 0) return none()
      const restore: Array<Before> = []
      for (const l of locked) {
        yield* sql`update returns set assignee_id = ${input.memberId} where id = ${l.id}`
        const ev = yield* event(sql, l.id, "assigned", input.memberId === null ? "Toewijzing weggehaald" : "Toegewezen")
        yield* audit(sql, "return.assigned", l.id, { memberId: input.memberId })
        restore.push(before(l, [ev]))
      }
      return yield* answer(sql, locked.map((l) => l.id), { kind: "fields", returns: restore })
    })
  )
})

/** "Ontvangen markeren": the parcel is in, whether it was scanned on the way or not. */
export const markReceived = Effect.fn("Returns.markReceived")(function*(id: string) {
  yield* Policy.require("returns", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* movable(sql, [id], "received", "receive")
      yield* sql`update returns set status = 'received', received_at = now() where id = ${l!.id}`
      const ev = yield* event(sql, l!.id, "received", "Ontvangen gemarkeerd")
      yield* audit(sql, "return.received", l!.id)
      return yield* answer(sql, [l!.id], { kind: "fields", returns: [before(l!, [ev])] })
    })
  )
})

/**
 * Where the shopper sends the parcel from, for a label: the order's shipping address, else the customer's own; the name
 * on it, else the customer's, else the return's. `r`, `o` and `c` are the return, its order and its customer.
 */
export const SHOPPER =
  `coalesce(nullif(coalesce(o.shipping_address, c.address) ->> 'name', ''), c.name, r.customer_name) as name,
  coalesce(o.shipping_address, c.address) ->> 'line1' as line1,
  coalesce(o.shipping_address, c.address) ->> 'postcode' as postcode,
  coalesce(o.shipping_address, c.address) ->> 'city' as city,
  coalesce(o.shipping_address, c.address) ->> 'country' as ship_country`

/** The parts of an order's shipping address a carrier's label needs, where it has them all. */
export const shopperAddress = (a: {
  name: string | null
  line1: string | null
  postcode: string | null
  city: string | null
  country: string | null
}) =>
  a.name === null || a.line1 === null || a.postcode === null || a.city === null || a.country === null
    ? undefined
    : { name: a.name, line1: a.line1, postcode: a.postcode, city: a.city, country: a.country }

/** The return address for parcels from `country`: its own, else the first, where it has what a label needs. */
export const returnAddress = (
  addresses: ReadonlyArray<{
    readonly country: string
    readonly carrier: string
    readonly name?: string | undefined
    readonly line1?: string | undefined
    readonly postcode?: string | undefined
    readonly city?: string | undefined
  }>,
  country: string | null
) => {
  const a = addresses.find((x) => x.country === country) ?? addresses[0]
  return a === undefined || a.name === undefined || a.line1 === undefined || a.postcode === undefined ||
      a.city === undefined
    ? undefined
    : { carrier: a.carrier, name: a.name, line1: a.line1, postcode: a.postcode, city: a.city, country: a.country }
}

/**
 * "Label versturen" (M9.2): a return label for each return waiting for its parcel, from the carrier its return address
 * names. Asked for here; made at the carrier once the undo window has passed (`return.label_requested`), so Undo costs
 * nothing. A return with a label made, or one already asked for, is left as it is; one the carrier refused is asked
 * again. Refused when no carrier is set up, or when a return has no return address or no address of the shopper's.
 */
export const sendLabel = Effect.fn("Returns.sendLabel")(function*(input: typeof SendLabelInput.Type) {
  yield* Policy.require("returns", 2)
  const labels = yield* Labels
  if (!labels.configured) return yield* new LabelsUnavailable()
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      const facts = yield* sql<{
        id: string
        label: string | null
        country: string | null
        name: string | null
        line1: string | null
        postcode: string | null
        city: string | null
        shipCountry: string | null
      }>`
        select r.id, r.label::text as label, r.country, ${sql.literal(SHOPPER)}
        from returns r join orders o on o.id = r.order_id left join customers c on c.id = r.customer_id
        where r.id in ${sql.in(locked.map((l) => l.id))}`
      const byId = new Map(facts.map((f) => [f.id, f]))
      const waiting = locked.filter((l) => l.status === "awaiting_parcel")
      if (waiting.length === 0 && locked.length === 1) {
        return yield* new IllegalReturnMove({ id: locked[0]!.id, from: locked[0]!.status, move: "sendLabel" })
      }
      const going = waiting.filter((l) => {
        const label = byId.get(l.id)?.label
        const state = label === null || label === undefined
          ? null
          : (JSON.parse(label) as StoredLabel).state ?? "issued"
        return state === null || state === "failed"
      })
      if (going.length === 0) return { change: none(), outboxId: null }
      const settings = yield* load(sql)
      for (const l of going) {
        const f = byId.get(l.id)!
        const to = returnAddress(
          settings.addresses.map((a) => ({
            country: a.country,
            carrier: a.carrier,
            ...(a.name === null ? {} : { name: a.name }),
            ...(a.line1 === null ? {} : { line1: a.line1 }),
            ...(a.postcode === null ? {} : { postcode: a.postcode }),
            ...(a.city === null ? {} : { city: a.city })
          })),
          f.country
        )
        if (to === undefined) return yield* new LabelNotPossible({ id: l.id, why: "no_return_address" })
        const from = shopperAddress({ ...f, country: f.shipCountry ?? f.country })
        if (from === undefined) return yield* new LabelNotPossible({ id: l.id, why: "no_shopper_address" })
        yield* sql`update returns set label = ${
          JSON.stringify({
            state: "requested",
            carrier: to.carrier,
            requestedAt: Date.now()
          })
        }::jsonb where id = ${l.id}`
        yield* audit(sql, "return.label_requested", l.id, { carrier: to.carrier })
      }
      const ids = going.map((l) => l.id)
      const sent = yield* Outbox.write(sql, principal.workspaceId, {
        type: "return.label_requested",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        returnIds: ids
      }, { afterSeconds: UNDO_SECONDS })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: {
          kind: "labels",
          returns: going.map((l) => ({ id: l.id, label: byId.get(l.id)!.label, events: [] }))
        },
        outboxIds: [sent]
      })
      return { change: new ReturnChange({ returns: yield* rowsOf(sql, ids), undo }), outboxId: sent }
    })
  )
  if (outboxId !== null) yield* relay.kick([outboxId], { afterSeconds: UNDO_SECONDS })
  return change
})

/**
 * "Tracking invullen" ("zelf versturen", M9.2): the shopper sent the parcel with their own carrier and passed on the
 * tracking number. It stands where a label would, and AfterShip follows it as it follows a label's (the 15-minute
 * sweep). Only for a return waiting for its parcel without a label made by Insyte; a number filled in earlier can be
 * corrected. With Undo.
 */
export const addTracking = Effect.fn("Returns.addTracking")(function*(input: typeof AddTrackingInput.Type) {
  yield* Policy.require("returns", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [input.id])
      if (l!.status !== "awaiting_parcel") {
        return yield* new IllegalReturnMove({ id: l!.id, from: l!.status, move: "addTracking" })
      }
      const [row] = yield* sql<{ label: string | null }>`select label::text as label from returns where id = ${l!.id}`
      const stored = row?.label === null || row?.label === undefined ? null : JSON.parse(row.label) as StoredLabel
      if (stored !== null && stored.self !== true && stored.state !== "failed") {
        return yield* new IllegalReturnMove({ id: l!.id, from: l!.status, move: "addTracking" })
      }
      const tracking = input.tracking.replace(/\s+/g, "").toUpperCase()
      yield* sql`update returns set label = ${
        JSON.stringify({
          state: "issued",
          self: true,
          carrier: input.carrier,
          tracking,
          trackingUrl: null,
          sentAt: Date.now(),
          fileId: null
        })
      }::jsonb, parcel_aftership_id = null, parcel_status = null, parcel_attempts = 0, parcel_error = null
                 where id = ${l!.id}`
      const ev = yield* event(sql, l!.id, "note", `Trackingnummer ingevuld: ${input.carrier} ${tracking}`)
      yield* audit(sql, "return.tracking_added", l!.id, { carrier: input.carrier })
      return yield* answer(sql, [l!.id], {
        kind: "labels",
        returns: [{ id: l!.id, label: row?.label ?? null, events: [ev] }]
      })
    })
  )
})

/** "Gecontroleerd, in orde": each line's condition and whether it goes back on the shelf; then it is to settle. */
export const inspect = Effect.fn("Returns.inspect")(function*(input: typeof InspectInput.Type) {
  yield* Policy.require("returns", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* movable(sql, [input.id], "ready", "inspect")
      const lines = yield* lineState(sql, [l!.id])
      for (const given of input.lines ?? []) {
        if (!lines.some((x) => x.id === given.lineId)) {
          return yield* new LineNotReturnable({ lineId: given.lineId, why: "unknown" })
        }
      }
      for (const line of lines) {
        const given = input.lines?.find((x) => x.lineId === line.id)
        const condition = given?.condition ?? "ok"
        yield* sql`update return_lines set condition = ${condition},
                     restock = ${given?.restock ?? condition === "ok"} where id = ${line.id}`
      }
      const allOk = (input.lines ?? []).every((x) => x.condition === "ok")
      yield* sql`update returns set status = 'ready', inspected_at = now() where id = ${l!.id}`
      const ev = yield* event(
        sql,
        l!.id,
        "inspected",
        allOk ? "Gecontroleerd: in orde" : "Gecontroleerd: niet alles in orde"
      )
      yield* audit(sql, "return.inspected", l!.id, { lines: input.lines ?? "all_ok" })
      return yield* answer(sql, [l!.id], {
        kind: "fields",
        returns: [before(l!, [ev], lines.map((x) => ({ id: x.id, condition: x.condition, restock: x.restock })))]
      })
    })
  )
})

const RESOLVED_TEXT = {
  refund: "terugbetaald",
  exchange: "ruilen",
  gift_card: "cadeaubon",
  replacement: "nieuw artikel",
  discount: "kortingscode"
} as const

const decodeRefundId = Schema.decodeUnknownEffect(RefundId)

/** What Shopify makes for each resolution but a refund (M9.3), and the code it is made under. */
const SHOPIFY_CODE = {
  gift_card: (_number: string) => giftCardCode(),
  discount: (number: string) => discountCode(number),
  exchange: () => undefined,
  replacement: () => undefined
} as const

/**
 * "Afhandelen": settles a return that is ready with a resolution it allows, at what the rules say it moves. A refund
 * runs `Orders.refund` here, on this transaction, within the person's refund limit (`refunds.write`); it cannot be
 * taken back, so it answers no undo, and the shopper hears of it. The other resolutions are recorded with an undo, and
 * what they make in Shopify (a gift card, a discount code, the exchange or replacement order, M9.3) waits out its window
 * (`return.resolution_requested`); Undo cancels it there, so nothing is made. The shopper hears once it is made.
 */
export const resolve = Effect.fn("Returns.resolve")(function*(input: typeof ResolveInput.Type) {
  yield* Policy.require("returns", 2)
  yield* Policy.requireAction("returns.approve")
  if (input.resolution === "refund") yield* Policy.requireAction("refunds.write")
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const { change, now, heldIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [input.id])
      // The same refund asked again (a retried request): the return it settled, unchanged.
      if (l!.status === "resolved" && input.refundId !== undefined) {
        const [same] = yield* sql`select 1 from returns where id = ${l!.id} and refund_id = ${input.refundId}`
        if (same !== undefined) {
          return { change: yield* answer(sql, [l!.id], null), now: [], heldIds: [] }
        }
      }
      if (!canMove(l!.status, "resolved")) {
        return yield* new IllegalReturnMove({ id: l!.id, from: l!.status, move: "resolve" })
      }
      const s = yield* load(sql)
      const lines = yield* linesOf(sql, l!.id)
      const [facts] = yield* sql<{ reasonId: string; placedAt: Date; deliveredAt: Date | null }>`
        select r.reason_id, o.placed_at, r.delivered_at from returns r join orders o on o.id = r.order_id
        where r.id = ${l!.id}`
      const amountMinor = lines.reduce((n, x) => n + x.qty * Number(x.unitPriceMinor), 0)
      const { allowed } = judge(s, { kind: l!.type, ...facts!, amountMinor, lines })
      const chosen = allowed.find((a) => a.kind === input.resolution)
      if (chosen === undefined) return yield* new ResolutionNotAllowed({ resolution: input.resolution })

      let refundId: string | null = null
      let outbox: string | null = null
      if (input.resolution === "refund") {
        if (input.refundId === undefined) return yield* new Invalid({ fields: { refundId: "required" } })
        refundId = yield* decodeRefundId(input.refundId).pipe(
          Effect.mapError(() => new Invalid({ fields: { refundId: "invalid" } }))
        )
        const refunder = yield* Refunder
        const refunded = yield* refunder.refund(sql, {
          orderId: l!.orderId,
          refundId,
          amountMinor: chosen.amountMinor,
          note: `Retour ${l!.number}`
        })
        outbox = refunded.outboxId
      }
      const exchangeTo = input.exchangeTo?.trim() || l!.exchangeTo
      const shopify: StoredResolution | null = input.resolution === "refund" ? null : {
        state: "requested",
        amountMinor: chosen.amountMinor,
        ...((code) => code === undefined ? {} : { code })(SHOPIFY_CODE[input.resolution](l!.number))
      }
      yield* sql`update returns set status = 'resolved', resolution = ${input.resolution},
                   resolution_minor = ${chosen.amountMinor}, resolved_at = now(), resolved_by = ${principal.id},
                   refund_id = ${refundId}, exchange_to = ${exchangeTo},
                   resolution_shopify = ${shopify === null ? null : JSON.stringify(shopify)}::jsonb
                 where id = ${l!.id}`
      const ev = yield* event(sql, l!.id, "resolved", `Afgehandeld: ${RESOLVED_TEXT[input.resolution]}`, {
        resolution: input.resolution,
        amountMinor: chosen.amountMinor
      })
      yield* audit(sql, "return.resolved", l!.id, {
        resolution: input.resolution,
        amountMinor: chosen.amountMinor,
        refundId
      })
      const userId = principal.userId ?? principal.id
      if (input.resolution === "refund") {
        // Money that leaves cannot be taken back: the shopper hears of it at once.
        const told = yield* Outbox.write(sql, principal.workspaceId, {
          type: "return.resolved",
          workspaceId: principal.workspaceId,
          userId,
          returnIds: [l!.id]
        })
        return {
          change: yield* answer(sql, [l!.id], null),
          now: outbox === null ? [told] : [outbox, told],
          heldIds: []
        }
      }
      const sent = yield* Outbox.write(sql, principal.workspaceId, {
        type: "return.resolution_requested",
        workspaceId: principal.workspaceId,
        userId,
        returnIds: [l!.id]
      }, { afterSeconds: UNDO_SECONDS })
      return {
        change: yield* answer(sql, [l!.id], { kind: "fields", returns: [before(l!, [ev])] }, [sent]),
        now: [],
        heldIds: [sent]
      }
    })
  )
  if (now.length > 0) yield* relay.kick(now)
  yield* kickHeld(heldIds)
  return change
})

/**
 * "Opnieuw proberen" (M9.3): a resolution Shopify did not make (refused, unreachable, or a scope the store had not
 * granted yet) asked again, at once, under the same code, so a card or code made after all is found rather than made
 * twice. Nothing to undo: it only asks again for what was already decided.
 */
export const retryResolution = Effect.fn("Returns.retryResolution")(function*(id: string) {
  yield* Policy.require("returns", 2)
  yield* Policy.requireAction("returns.approve")
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [l] = yield* lock(sql, [id])
      const [row] = yield* sql<{ shopify: string | null }>`
        select resolution_shopify::text as shopify from returns where id = ${l!.id}`
      const stored = row?.shopify === null || row?.shopify === undefined
        ? null
        : JSON.parse(row.shopify) as StoredResolution
      if (l!.status !== "resolved" || stored?.state !== "failed") {
        return yield* new IllegalReturnMove({ id: l!.id, from: l!.status, move: "retryResolution" })
      }
      const { reason: _reason, scope: _scope, ...kept } = stored
      yield* sql`update returns set resolution_shopify = ${JSON.stringify({ ...kept, state: "requested" })}::jsonb
                 where id = ${l!.id}`
      yield* event(sql, l!.id, "note", "Opnieuw gevraagd in Shopify")
      yield* audit(sql, "return.resolution_retried", l!.id, { resolution: l!.resolution })
      const sent = yield* Outbox.write(sql, principal.workspaceId, {
        type: "return.resolution_requested",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        returnIds: [l!.id]
      })
      return { change: yield* answer(sql, [l!.id], null), outboxId: sent }
    })
  )
  yield* relay.kick([outboxId])
  return change
})

const decodeRestore = Schema.decodeUnknownEffect(ReturnsRestore)

/** `Shared.undo`'s compensation: the returns as they were, a started one taken away, or the settings as they were. */
export const restore = Effect.fn("Returns.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const undo = yield* decodeRestore(compensation).pipe(Effect.orDie)
  if (undo.kind === "settings") return yield* restoreSettings(sql, undo.document)
  yield* Policy.require("returns", 2)
  if (undo.kind === "created") {
    yield* sql`delete from returns where id = ${undo.id} and status = 'review'`
    return
  }
  if (undo.kind === "labels") {
    // The label as it was. A request's outbox row is cancelled with the token, so nothing reached the carrier; a
    // request already sent cannot be redeemed at all. A parcel registered meanwhile is forgotten with it.
    for (const r of undo.returns) {
      yield* sql`update returns set label = ${r.label}::jsonb, parcel_aftership_id = null, parcel_status = null,
                   parcel_attempts = 0, parcel_error = null
                 where id = ${r.id}`
      if (r.events.length > 0) yield* sql`delete from return_events where id in ${sql.in([...r.events])}`
    }
    return
  }
  for (const r of undo.returns) {
    yield* sql`update returns set status = ${r.status}, assignee_id = ${r.assigneeId}, keep_item = ${r.keepItem},
                 rejected_reason = ${r.rejectedReason},
                 received_at = ${r.receivedAt === null ? null : new Date(r.receivedAt)},
                 inspected_at = ${r.inspectedAt === null ? null : new Date(r.inspectedAt)},
                 resolution = ${r.resolution}, resolution_minor = ${r.resolutionMinor},
                 resolved_at = ${r.resolvedAt === null ? null : new Date(r.resolvedAt)}, resolved_by = ${r.resolvedBy},
                 exchange_to = ${r.exchangeTo},
                 resolution_shopify = case when ${r.resolution}::text is null then null else resolution_shopify end
               where id = ${r.id}`
    if (r.events.length > 0) yield* sql`delete from return_events where id in ${sql.in([...r.events])}`
    for (const line of r.lines) {
      yield* sql`update return_lines set condition = ${line.condition}, restock = ${line.restock} where id = ${line.id}`
    }
  }
})
