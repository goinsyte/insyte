import type { RunContext, RunRecordKind } from "@insyte/domain/automations/Engine"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"

/*
 * What a run's steps can read (M12 step 3; widgets/05 §1.0): its record as the `{{field}}` values `Fields.ts` names,
 * the records it leads to (the order a chargeback disputes, a thread's customer), what happened in one line
 * (`trigger.summary`) and the Runs drawer's Invoer. An order, a chargeback, a variant or a mail thread.
 */

const euro = (minor: number) =>
  (minor / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const regionName = (code: string) => {
  try {
    return new Intl.DisplayNames(["nl"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

const day = (at: Date, timeZone: string) => {
  try {
    return at.toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone })
  } catch {
    return at.toLocaleDateString("nl-NL", { day: "numeric", month: "long" })
  }
}

const STATUS: Readonly<Record<string, string>> = {
  placed: "geplaatst",
  paid: "betaald",
  at_supplier: "bij de leverancier",
  shipped: "verzonden",
  delivered: "bezorgd",
  cancelled: "geannuleerd",
  refunded: "terugbetaald"
}

const REASON: Readonly<Record<string, string>> = {
  item_not_received: "Niet ontvangen",
  not_as_described: "Niet zoals beschreven",
  unauthorized: "Niet herkend",
  duplicate: "Dubbel afgeschreven",
  other: "Anders"
}

/** Days a parcel takes from shipping to the door, and from order to the door, when the workspace has no history. */
const TRANSIT_DAYS = 5
const ORDER_TO_DOOR_DAYS = 10

/** When the order is expected at the door, and on whose word ("Leverdatum herberekenen", M8's facts). */
export interface Eta {
  readonly at: Date
  readonly basis: "delivered" | "carrier" | "supplier" | "history"
}

/**
 * The order's expected delivery: the day it arrived; else the latest the carrier expects for its parcels; else the
 * supplier's hand-off plus how long the workspace's parcels took from shipping lately; else its placed day plus how
 * long its orders took to arrive lately. `undefined` for an order cancelled or unknown.
 */
export const etaOf = Effect.fn("Automations.etaOf")(function*(sql: SqlClient.SqlClient, orderId: string) {
  const [o] = yield* sql<{
    status: string
    placedAt: Date | null
    deliveredAt: Date | null
    carrierAt: Date | null
    handoffBy: Date | null
    transitDays: number | null
    doorDays: number | null
  }>`
    select o.status, o.placed_at,
           (select max(coalesce(d.delivered_at, f.delivered_at)) from fulfilments f
            left join deliveries d on d.fulfilment_id = f.id where f.order_id = o.id) as delivered_at,
           (select max(d.estimated_delivery) from deliveries d where d.order_id = o.id and d.delivered_at is null)
             as carrier_at,
           (select max(w.handoff_by) from supplier_work w where w.order_id = o.id and w.status <> 'shipped')
             as handoff_by,
           (select percentile_cont(0.5) within group (order by extract(epoch from (d.delivered_at - f.shipped_at)) / 86400)
            from (select f2.* from fulfilments f2 where f2.shipped_at is not null order by f2.shipped_at desc limit 200) f
            join deliveries d on d.fulfilment_id = f.id where d.delivered_at is not null) as transit_days,
           (select percentile_cont(0.5) within group (order by extract(epoch from (d.delivered_at - p.placed_at)) / 86400)
            from (select o2.id, o2.placed_at from orders o2 where o2.placed_at is not null
                  order by o2.placed_at desc limit 200) p
            join deliveries d on d.order_id = p.id where d.delivered_at is not null) as door_days
    from orders o where o.id = ${orderId}`
  if (o === undefined || o.status === "cancelled" || o.placedAt === null) return undefined
  if (o.status === "delivered" && o.deliveredAt !== null) return { at: o.deliveredAt, basis: "delivered" } as Eta
  if (o.carrierAt !== null) return { at: o.carrierAt, basis: "carrier" } as Eta
  const plus = (from: Date, days: number) => new Date(from.getTime() + Math.ceil(days) * 86_400_000)
  if (o.handoffBy !== null) {
    return { at: plus(o.handoffBy, Number(o.transitDays ?? TRANSIT_DAYS)), basis: "supplier" } as Eta
  }
  return { at: plus(o.placedAt, Number(o.doorDays ?? ORDER_TO_DOOR_DAYS)), basis: "history" } as Eta
})

/** How the Runs drawer says an ETA's word. */
export const ETA_BASIS: Readonly<Record<Eta["basis"], string>> = {
  delivered: "bezorgd",
  carrier: "volgens de vervoerder",
  supplier: "volgens de overdracht van de leverancier en de gewone reistijd",
  history: "geschat uit de levertijd van eerdere bestellingen"
}

const timezoneOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ timezone: string }>`select timezone from workspaces where id = app_workspace_id()`,
    ([w]) => w?.timezone ?? "Europe/Amsterdam"
  )

/** What an order run's steps can read, as the fields `Fields.ts` names. */
export const orderContext = Effect.fn("Automations.orderContext")(function*(sql: SqlClient.SqlClient, orderId: string) {
  const [o] = yield* sql<{
    number: string
    totalMinor: string
    status: string
    customerName: string | null
    customerEmail: string | null
    country: string | null
    tags: Array<string>
    customerTags: Array<string> | null
    lifetimeValueMinor: string | null
    suppliers: string | null
    trackingUrl: string | null
  }>`
    select o.number, o.total_minor, o.status, o.customer_name, o.customer_email,
           o.shipping_address ->> 'country' as country, o.tags, c.tags as customer_tags, c.lifetime_value_minor,
           (select string_agg(distinct x.name, ', ') from forwarding_items f join suppliers x on x.id = f.supplier_id
            where f.order_id = o.id) as suppliers,
           (select f.tracking_url from fulfilments f where f.order_id = o.id and f.tracking_url is not null
            order by f.shipped_at desc nulls last limit 1) as tracking_url
    from orders o left join customers c on c.id = o.customer_id
    where o.id = ${orderId}`
  if (o === undefined) return undefined
  const eta = yield* etaOf(sql, orderId)
  const timeZone = yield* timezoneOf(sql)
  const name = o.customerName ?? ""
  const context: Record<string, string> = {
    "order.number": o.number,
    "order.total": euro(Number(o.totalMinor)),
    "order.status": STATUS[o.status] ?? o.status,
    "order.country": o.country === null ? "" : regionName(o.country),
    "order.country_code": o.country ?? "",
    "order.tags": o.tags.join(", "),
    "customer.name": name,
    "customer.first_name": name.split(/\s+/)[0] ?? "",
    "customer.email": o.customerEmail ?? "",
    "customer.tags": (o.customerTags ?? []).join(", "),
    ...(o.lifetimeValueMinor === null ? {} : { "customer.lifetime_value": `€ ${euro(Number(o.lifetimeValueMinor))}` }),
    ...(o.suppliers === null ? {} : { "order.supplier": o.suppliers }),
    ...(o.trackingUrl === null ? {} : { "order.tracking_url": o.trackingUrl }),
    ...(eta === undefined ? {} : { "order.expected_delivery": day(eta.at, timeZone) })
  }
  return context
})

/** What a run reads, the records it leads to, and the line `trigger.summary` says. */
export interface Read {
  readonly context: RunContext
  readonly orderId: string | null
  readonly customerId: string | null
  readonly threadId: string | null
  /** The record's number and name, as a run's row shows it (`RunRecordRef`). */
  readonly number: string
  readonly name: string
}

/**
 * A run's record read for its steps, or `undefined` when it is gone. A chargeback reads as its order too, a thread as
 * its customer's last order (for `{{order.number}}` only: no action takes that order as the thread's).
 */
export const contextOf = Effect.fn("Automations.contextOf")(function*(
  sql: SqlClient.SqlClient,
  kind: RunRecordKind | string,
  id: string,
  summary: string
) {
  switch (kind) {
    case "order": {
      const c = yield* orderContext(sql, id)
      if (c === undefined) return undefined
      const [o] = yield* sql<{ customerId: string | null }>`select customer_id from orders where id = ${id}`
      return {
        context: { "trigger.summary": `Bestelling ${c["order.number"] ?? ""} ${summary}`, ...c },
        orderId: id,
        customerId: o?.customerId ?? null,
        threadId: null,
        number: c["order.number"] ?? "",
        name: c["customer.name"] ?? ""
      } satisfies Read
    }
    case "chargeback": {
      const [cb] = yield* sql<{
        caseNumber: string
        orderId: string | null
        customerId: string | null
        customerName: string | null
        amountMinor: string
        reason: string
        deadlineAt: Date
      }>`
        select case_number, order_id, customer_id, customer_name, amount_minor, reason, deadline_at
        from chargebacks where id = ${id}`
      if (cb === undefined) return undefined
      const order = cb.orderId === null ? undefined : yield* orderContext(sql, cb.orderId)
      const timeZone = yield* timezoneOf(sql)
      const name = cb.customerName ?? order?.["customer.name"] ?? ""
      return {
        context: {
          ...order,
          "trigger.summary": `Chargeback ${cb.caseNumber} geopend${
            order === undefined ? "" : ` op bestelling ${order["order.number"] ?? ""}`
          }`,
          "chargeback.case": cb.caseNumber,
          "chargeback.reason": REASON[cb.reason] ?? cb.reason,
          "chargeback.amount": euro(Number(cb.amountMinor)),
          "chargeback.due_at": day(cb.deadlineAt, timeZone),
          "customer.name": name,
          "customer.first_name": name.split(/\s+/)[0] ?? ""
        },
        orderId: cb.orderId,
        customerId: cb.customerId,
        threadId: null,
        number: cb.caseNumber,
        name
      } satisfies Read
    }
    case "product": {
      const [v] = yield* sql<{ product: string; variant: string; sku: string | null; stock: number }>`
        select p.title as product, v.title as variant, v.sku,
               coalesce((select sum(i.available) from inventory_levels i where i.variant_id = v.id), 0)::int as stock
        from variants v join products p on p.id = v.product_id where v.id = ${id}`
      if (v === undefined) return undefined
      const title = v.variant === "" || v.variant === "Default Title" ? v.product : `${v.product} · ${v.variant}`
      return {
        context: {
          "trigger.summary": `${title}: nog ${v.stock} op voorraad`,
          "product.title": title,
          "product.sku": v.sku ?? "",
          "product.stock": String(v.stock)
        },
        orderId: null,
        customerId: null,
        threadId: null,
        number: v.sku ?? title,
        name: title
      } satisfies Read
    }
    case "thread": {
      const [t] = yield* sql<{
        subject: string
        customerId: string | null
        fromName: string | null
        fromAddress: string | null
        body: string | null
      }>`
        select t.subject, t.customer_id, m.from_name, m.from_address, m.body_text as body
        from email_threads t
        left join lateral (select * from email_messages m where m.thread_id = t.id and m.direction = 'inbound'
                           order by m.sent_at desc limit 1) m on true
        where t.id = ${id}`
      if (t === undefined) return undefined
      const [last] = t.customerId === null
        ? []
        : yield* sql<{ number: string }>`
          select number from orders where customer_id = ${t.customerId} and not is_draft
          order by placed_at desc nulls last limit 1`
      const name = t.fromName ?? ""
      return {
        context: {
          "trigger.summary": `E-mail van ${name || t.fromAddress || "een klant"}: ${t.subject}`,
          "conversation.subject": t.subject,
          "conversation.last_message": (t.body ?? "").slice(0, 2000),
          "customer.name": name,
          "customer.first_name": name.split(/\s+/)[0] ?? "",
          "customer.email": t.fromAddress ?? "",
          ...(last === undefined ? {} : { "order.number": last.number })
        },
        orderId: null,
        customerId: t.customerId,
        threadId: id,
        number: t.subject,
        name
      } satisfies Read
    }
    default:
      return undefined
  }
})

/** What the run read when it started, as the Runs drawer's Invoer shows it, by the kind of record it is about. */
export const inputOf = (context: RunContext): Record<string, string> => {
  const pick: Array<[string, string]> = context["chargeback.case"] !== undefined
    ? [
      ["Zaak", "chargeback.case"],
      ["Bestelling", "order.number"],
      ["Klant", "customer.name"],
      ["Bedrag", "chargeback.amount"],
      ["Reden", "chargeback.reason"]
    ]
    : context["product.title"] !== undefined
    ? [["Product", "product.title"], ["SKU", "product.sku"], ["Voorraad", "product.stock"]]
    : context["conversation.subject"] !== undefined
    ? [["Onderwerp", "conversation.subject"], ["Van", "customer.name"], ["E-mail", "customer.email"]]
    : [
      ["Bestelling", "order.number"],
      ["Klant", "customer.name"],
      ["E-mail", "customer.email"],
      ["Totaal", "order.total"],
      ["Land", "order.country"]
    ]
  return Object.fromEntries(
    pick.flatMap(([label, path]) => {
      const value = context[path] ?? ""
      if (value === "") return []
      const money = path === "order.total" || path === "chargeback.amount"
      return [[label, money ? `€ ${value}` : path === "product.stock" ? `${value} stuks` : value]]
    })
  )
}
