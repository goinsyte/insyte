import {
  type ConflictV1,
  CurrentApiKey,
  type IdempotencyKeyReusedV1,
  type InvalidRequestV1,
  type ListQuery,
  type NotFoundV1,
  type RefundOverLimitV1,
  type ScopeMissingV1,
  type ValidationFailedV1
} from "@insyte/api/http/PublicApi"
import type { Forbidden } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { isSpecial, type Permission, scopesOf } from "@insyte/domain/Permissions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CustomersService } from "@insyte/modules/customers/Customers"
import { Members } from "@insyte/modules/members/Members"
import type { OrderDetail, OrderRow } from "@insyte/modules/orders/domain/Orders"
import { OrdersService } from "@insyte/modules/orders/Orders"
import { ProductsService } from "@insyte/modules/products/Products"
import { RolesService } from "@insyte/modules/roles/RolesService"
import type { FilterNode, ListInput } from "@insyte/modules/shared/domain/Filter"
import * as Idempotency from "@insyte/modules/shared/use-cases/Idempotency"
import { Context, Effect, Layer } from "effect"

/*
 * What a key reads (M19.2, M19.3), in the public shape: `/v1` answers with these and the MCP tools return them, over
 * the same use cases the console calls, so a key and a person see the same team.
 */

const ACCESS = ["none", "read", "write", "manage"] as const

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

/** The use case's refusal as the scope the key misses, in the V1 envelope (a special action is its own scope). */
const scopeMissing = (e: Forbidden) =>
  Effect.flatMap(CurrentApiKey, (key) => {
    const scope = isSpecial(e.permission as Permission)
      ? e.permission
      : `${e.permission}.${e.level >= 2 ? "write" : "read"}`
    return Effect.fail<ScopeMissingV1>({
      error: { code: "ScopeMissingV1", message: `This key lacks ${scope}.`, request_id: key.requestId, scope }
    })
  })

/** A list's query as the use case's input; `status` is the one-status filter. */
const listInput = (query: ListQuery, statusField: string | undefined): ListInput => {
  const filter: FilterNode | undefined = query.status === undefined || statusField === undefined
    ? undefined
    : { kind: "rule", id: "status", field: statusField, op: "any", value: [query.status] }
  return {
    ...(query.limit === undefined ? {} : { limit: Math.min(200, Math.max(1, Math.floor(query.limit))) }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.q === undefined ? {} : { q: query.q }),
    ...(query.store_id === undefined ? {} : { storeId: query.store_id }),
    ...(filter === undefined ? {} : { filter })
  }
}

/** A cursor the list did not hand out, in the V1 envelope. */
const invalid = (field: string) =>
  Effect.flatMap(CurrentApiKey, (key) =>
    Effect.fail<InvalidRequestV1>({
      error: {
        code: "InvalidRequestV1",
        message: `The ${field} is not one this list handed out.`,
        request_id: key.requestId,
        field
      }
    }))

/** A write's `Idempotency-Key`: the public API needs one on every write (MCP's tools go without). */
export const keyOf = (header: string | undefined) =>
  header !== undefined && header.trim() !== "" && header.length <= 255
    ? Effect.succeed(header)
    : Effect.flatMap(CurrentApiKey, (key) =>
      Effect.fail<InvalidRequestV1>({
        error: {
          code: "InvalidRequestV1",
          message: "Every write needs an Idempotency-Key header of up to 255 characters, the same when you retry.",
          request_id: key.requestId,
          field: "idempotency-key"
        }
      }))

/** An error in its V1 envelope, with the request's id. */
const fail = <Code extends string, Extra extends Record<string, unknown>>(code: Code, message: string, extra: Extra) =>
  Effect.flatMap(CurrentApiKey, (key) => Effect.fail({ error: { code, message, request_id: key.requestId, ...extra } }))

const notFound = () => fail("NotFoundV1" as const, "No such order in this key's stores.", {})
const conflict = (reason: string) => fail("ConflictV1" as const, `Not possible now: ${reason}.`, { reason })
const validation = (fields: Readonly<Record<string, string>>) =>
  fail("ValidationFailedV1" as const, "The request has fields that cannot be used.", { fields: { ...fields } })

/** An order row in the public shape. */
const orderV1 = (o: OrderRow) => ({
  id: o.id,
  number: o.number,
  store_id: o.storeId,
  customer: { id: o.customerId, name: o.customerName, email: o.customerEmail },
  status: o.status,
  payment_status: o.paymentStatus,
  fulfillment_status: o.fulfillmentStatus,
  total: { amount_minor: o.totalMinor, currency: o.currency },
  tags: [...o.tags],
  line_count: o.lineCount,
  tracking: o.trackingNumber === null ? null : { carrier: o.carrier, number: o.trackingNumber },
  placed_at: iso(o.placedAt)!,
  updated_at: iso(o.updatedAt)!
})

const orderDetailV1 = (d: OrderDetail) => ({
  ...orderV1(d.order),
  lines: d.lines.map((l) => ({
    title: l.title,
    variant_title: l.variantTitle,
    sku: l.sku,
    quantity: l.quantity,
    unit_price_minor: l.unitPriceMinor
  })),
  shipping_address: d.shippingAddress,
  internal_note: d.internalNote?.body ?? null,
  refunds: d.refunds.map((r) => ({
    id: r.id,
    order_id: d.order.id,
    amount: { amount_minor: r.amountMinor, currency: r.currency },
    status: r.status,
    note: r.note,
    created_at: iso(r.createdAt)!
  }))
})

/** What an order command can refuse, as the use cases say it. */
type WriteRefusal =
  | Forbidden
  | { readonly _tag: "NotFound" }
  | { readonly _tag: "Conflict"; readonly reason: string }
  | { readonly _tag: "Invalid"; readonly fields: Readonly<Record<string, string>> }
  | { readonly _tag: "IdempotencyKeyReused" }
  | { readonly _tag: "IdempotencyInFlight" }

type WriteV1 = ScopeMissingV1 | NotFoundV1 | ConflictV1 | ValidationFailedV1 | IdempotencyKeyReusedV1

/** An order command's refusal in its V1 envelope. */
const writeV1 = (e: WriteRefusal): Effect.Effect<never, WriteV1, CurrentApiKey> => {
  switch (e._tag) {
    case "Forbidden":
      return scopeMissing(e)
    case "NotFound":
      return notFound()
    case "Conflict":
      return conflict(e.reason)
    case "Invalid":
      return validation(e.fields)
    case "IdempotencyKeyReused":
      return fail("IdempotencyKeyReusedV1" as const, "This Idempotency-Key was used for a different request.", {})
    case "IdempotencyInFlight":
      return conflict("in_progress")
  }
}

/** The same for a refund, which may also be over the key's limit or more than is left. */
const refundV1 = (
  e:
    | WriteRefusal
    | { readonly _tag: "RefundOverLimit"; readonly limitMinor: number }
    | { readonly _tag: "RefundOverBalance" }
    | { readonly _tag: "AlreadyRefunded" }
): Effect.Effect<never, WriteV1 | RefundOverLimitV1, CurrentApiKey> => {
  switch (e._tag) {
    case "RefundOverLimit":
      return fail("RefundOverLimitV1" as const, "More than this key may refund on one order.", {
        limit_minor: e.limitMinor
      })
    case "RefundOverBalance":
      return conflict("over_balance")
    case "AlreadyRefunded":
      return conflict("already_refunded")
    default:
      return writeV1(e)
  }
}

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz"

/**
 * The refund's id: from the caller's `Idempotency-Key` when there is one, so the same key is the same refund here and
 * Shopify's idempotency key there; a fresh one otherwise.
 */
const refundIdOf = (key: string | undefined, principalId: string) =>
  key === undefined || key.trim() === ""
    ? Effect.succeed(mintId("rfd"))
    : Effect.map(
      Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${principalId}:${key}`))),
      (bytes) => `rfd_${[...new Uint8Array(bytes).slice(0, 26)].map((b) => CROCKFORD[b % 32]).join("")}`
    )

const make = Effect.gen(function*() {
  const members = yield* Members
  const roles = yield* RolesService
  const orders = yield* OrdersService
  const products = yield* ProductsService
  const customers = yield* CustomersService
  return {
    me: Effect.gen(function*() {
      const key = yield* CurrentApiKey
      const { role } = yield* CurrentPrincipal
      return {
        key: { id: key.id, label: key.label, scopes: scopesOf(role.levels as Record<string, 0 | 1 | 2>) },
        workspace: { id: key.workspaceId, name: key.workspaceName }
      }
    }),
    members: members.get.pipe(
      Effect.map((team) => ({
        data: team.members.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          role: { id: m.roleId, label: m.roleLabel },
          status: m.deactivated ? "deactivated" as const : "active" as const,
          joined_at: iso(m.joinedAt)!,
          last_active_at: iso(m.lastActiveAt)
        }))
      })),
      Effect.catchTag("Forbidden", scopeMissing)
    ),
    roles: roles.list.pipe(
      Effect.map((list) => ({
        data: list.roles.map((r) => ({
          id: r.id,
          label: r.label,
          system: r.system,
          access: Object.fromEntries(Object.entries(r.levels).map(([area, level]) => [area, ACCESS[level]!]))
        }))
      })),
      Effect.catchTag("Forbidden", scopeMissing)
    ),
    orders: (query: ListQuery) =>
      orders.list(listInput(query, "status")).pipe(
        Effect.map((page) => ({
          data: page.rows.map(orderV1),
          next_cursor: page.nextCursor,
          total: page.counts.total
        })),
        Effect.catchTags({
          Forbidden: scopeMissing,
          CursorInvalid: () => invalid("cursor"),
          FilterFieldUnknown: () => invalid("status")
        })
      ),
    products: (query: ListQuery) =>
      products.list(listInput(query, "status")).pipe(
        Effect.map((page) => ({
          data: page.rows.map((p) => ({
            id: p.id,
            store_id: p.storeId,
            title: p.title,
            handle: p.handle,
            status: p.status,
            vendor: p.vendor,
            product_type: p.productType,
            tags: [...p.tags],
            image: p.image,
            variant_count: p.variantCount,
            price: { min_minor: p.priceMinMinor, max_minor: p.priceMaxMinor, currency: p.currency },
            available: p.available,
            updated_at: iso(p.updatedAt)!
          })),
          next_cursor: page.nextCursor,
          total: page.counts.total
        })),
        Effect.catchTags({
          Forbidden: scopeMissing,
          CursorInvalid: () => invalid("cursor"),
          FilterFieldUnknown: () => invalid("status")
        })
      ),
    customers: (query: ListQuery) =>
      customers.list(listInput(query, undefined)).pipe(
        Effect.map((page) => ({
          data: page.rows.map((c) => ({
            id: c.id,
            store_id: c.storeId,
            name: c.name,
            email: c.email,
            phone: c.phone,
            country: c.country,
            tags: [...c.tags],
            orders_count: c.ordersCount,
            lifetime_value: { amount_minor: c.lifetimeValueMinor, currency: c.currency },
            last_order_at: iso(c.lastOrderAt),
            updated_at: iso(c.updatedAt)!
          })),
          next_cursor: page.nextCursor,
          total: page.counts.total
        })),
        Effect.catchTags({
          Forbidden: scopeMissing,
          CursorInvalid: () => invalid("cursor"),
          FilterFieldUnknown: () => invalid("status")
        })
      ),
    // The order commands (M7, api.md §6), each once per `Idempotency-Key`.
    order: (id: string) =>
      orders.get(id).pipe(Effect.map(orderDetailV1), Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })),
    tagOrder: (
      id: string,
      body: { readonly add?: ReadonlyArray<string> | undefined; readonly remove?: ReadonlyArray<string> | undefined },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["tags", id, body],
        Effect.flatMap(
          orders.tag({ ids: [id], add: [...(body.add ?? [])], remove: [...(body.remove ?? [])] }),
          () => Effect.map(orders.get(id), (d) => orderV1(d.order))
        )
      ).pipe(Effect.catch(writeV1)),
    noteOrder: (id: string, body: { body: string }, key?: string) =>
      Idempotency.once(
        key,
        ["note", id, body],
        Effect.flatMap(orders.setNote(id, body.body), () => Effect.map(orders.get(id), orderDetailV1))
      ).pipe(Effect.catch(writeV1)),
    shipOrderTo: (
      id: string,
      a: {
        readonly line1: string
        readonly line2?: string | null | undefined
        readonly city: string
        readonly postcode: string
        readonly region?: string | undefined
        readonly country: string
      },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["shipping_address", id, a],
        Effect.map(
          orders.updateShipping({
            id,
            address: {
              line1: a.line1,
              line2: a.line2 ?? null,
              city: a.city,
              postcode: a.postcode,
              region: a.region ?? "",
              country: a.country
            }
          }),
          (change) => orderV1(change.orders[0]!)
        )
      ).pipe(Effect.catch(writeV1)),
    cancelOrder: (id: string, body: { restock: boolean; notify_customer: boolean }, key?: string) =>
      Idempotency.once(
        key,
        ["cancel", id, body],
        Effect.map(
          orders.cancel({ ids: [id], restock: body.restock, notify: body.notify_customer }),
          (change) => orderV1(change.orders[0]!)
        )
      ).pipe(Effect.catch(writeV1)),
    refundOrder: (
      id: string,
      body: { readonly amount_minor: number; readonly note?: string | undefined },
      key?: string
    ) =>
      Effect.gen(function*() {
        const principal = yield* CurrentPrincipal
        const refundId = yield* refundIdOf(key, principal.id)
        return yield* Idempotency.once(
          key,
          ["refund", id, body],
          Effect.gen(function*() {
            const result = yield* orders.refund({
              id,
              refundId,
              amountMinor: body.amount_minor,
              ...(body.note === undefined ? {} : { note: body.note })
            })
            const detail = yield* orders.get(id)
            const refund = detail.refunds.find((r) => r.id === result.refundId)!
            return {
              id: refund.id,
              order_id: id,
              amount: { amount_minor: refund.amountMinor, currency: refund.currency },
              status: refund.status,
              note: refund.note,
              created_at: iso(refund.createdAt)!
            }
          })
        )
      }).pipe(
        Effect.catch(refundV1)
      )
  }
})

/**
 * The reads, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class Resources extends Context.Service<Resources, Effect.Success<typeof make>>()("api-worker/Resources") {
  static readonly layer = Layer.effect(this, make).pipe(
    Layer.provide(
      Layer.mergeAll(
        Members.layer,
        RolesService.layer,
        OrdersService.layer,
        ProductsService.layer,
        CustomersService.layer
      )
    )
  )
}
