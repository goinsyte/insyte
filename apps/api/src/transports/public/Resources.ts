import { CurrentApiKey, type InvalidRequestV1, type ListQuery, type ScopeMissingV1 } from "@insyte/api/http/PublicApi"
import type { Forbidden } from "@insyte/domain/Errors"
import { scopesOf } from "@insyte/domain/Permissions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CustomersService } from "@insyte/modules/customers/Customers"
import { Members } from "@insyte/modules/members/Members"
import { OrdersService } from "@insyte/modules/orders/Orders"
import { ProductsService } from "@insyte/modules/products/Products"
import { RolesService } from "@insyte/modules/roles/RolesService"
import type { FilterNode, ListInput } from "@insyte/modules/shared/domain/Filter"
import { Context, Effect, Layer } from "effect"

/*
 * What a key reads (M19.2, M19.3), in the public shape: `/v1` answers with these and the MCP tools return them, over
 * the same use cases the console calls, so a key and a person see the same team.
 */

const ACCESS = ["none", "read", "write", "manage"] as const

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

/** The use case's refusal as the scope the key misses, in the V1 envelope. */
const scopeMissing = (e: Forbidden) =>
  Effect.flatMap(CurrentApiKey, (key) => {
    const scope = `${e.permission}.${e.level >= 2 ? "write" : "read"}`
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
          data: page.rows.map((o) => ({
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
