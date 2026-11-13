import { Db } from "@insyte/database/Db"
import { Forbidden } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { PLACES, SUB_PROCESSORS } from "@insyte/domain/Residency"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { actorNames } from "../../shared/use-cases/Actors.ts"
import {
  type CategoryId,
  type Deletion,
  EXPORT_DAYS,
  type ExportRow,
  type ExportSchedule,
  type Inventory,
  type PrivacyRequests,
  type RoleReach,
  type ShopperRequest
} from "../domain/Privacy.ts"

/*
 * Je gegevens' reads (M17 step 5): what the workspace holds per category, where, and who reaches it; and the requests
 * page: the exports and their schedule, the shoppers' requests, a deletion that waits. Both take Instellingen ·
 * Bewerken (api.md `Privacy.inventory`): who may see the workspace's whole shape is who may change its settings.
 */

/**
 * Only the owner: the workspace's whole export, its schedule, its deletion (api.md: `owner`). Refused as `Forbidden`
 * naming `owner`, which no role can be given, so the console says it is the owner's and the matrix sees it denied.
 */
export const requireOwner = Effect.fn("Privacy.requireOwner")(function*() {
  const principal = yield* CurrentPrincipal
  if (principal.kind !== "member" || principal.role.id !== "owner") {
    return yield* new Forbidden({ permission: "owner", level: 0, roleLabel: principal.role.label })
  }
  return principal
})

/**
 * The stores the principal reaches: their role's, narrowed by their own (a member invited to some stores, a key made
 * for some); null for every store.
 */
export const reachOf = (principal: {
  readonly role: { readonly stores: "all" | ReadonlyArray<string> }
  readonly storeScope: ReadonlyArray<string> | null
}): ReadonlyArray<string> | null => {
  const role = principal.role.stores
  const own = principal.storeScope
  if (role === "all") return own
  return own === null ? role : own.filter((s) => role.includes(s))
}

/** Each category's count, over the tables it is made of. */
const COUNTS: ReadonlyArray<readonly [CategoryId, string]> = [
  ["customers", "select count(*)::int as n from customers where deleted_at is null"],
  ["orders", "select count(*)::int as n from orders"],
  ["products", "select count(*)::int as n from products"],
  [
    "support",
    "select ((select count(*) from tickets where deleted_at is null) + (select count(*) from email_messages))::int as n"
  ],
  ["chats", "select count(*)::int as n from messages"],
  ["returns", "select count(*)::int as n from returns"],
  ["chargebacks", "select count(*)::int as n from chargebacks"],
  ["files", "select count(*)::int as n from files where deleted_at is null"],
  ["team", "select count(*)::int as n from members where removed_at is null"],
  ["log", "select count(*)::int as n from audit_events"]
]

const level = (levels: Record<string, number> | null, area: string) => {
  const l = levels?.[area] ?? 0
  return (l === 1 || l === 2 || l === 3 ? l : 0) as 0 | 1 | 2 | 3
}

/** "Wat Insyte bewaart", "Waar het staat", "Wie wat ziet". */
export const inventory = Effect.fn("Privacy.inventory")(function*() {
  yield* Policy.require("settings", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const categories = yield* Effect.forEach(COUNTS, ([id, statement]) =>
        Effect.map(sql.unsafe<{ n: number }>(statement), ([row]) => ({ id, count: row?.n ?? 0 })))
      const roles = yield* sql<{
        id: string
        label: string
        levels: Record<string, number>
        specials: Record<string, boolean>
        stores: unknown
        members: number
      }>`
        select r.id, r.label, r.levels, r.specials, r.stores,
               (select count(*)::int from members m
                where m.role_id = r.id and m.removed_at is null and m.deactivated_at is null) as members
        from roles r where r.deleted_at is null
        order by r.id = 'owner' desc, r.kind = 'system' desc, r.label`
      return {
        categories,
        countedAt: Date.now(),
        places: PLACES,
        subProcessors: SUB_PROCESSORS,
        roles: roles.map((r): RoleReach => ({
          id: r.id,
          label: r.label,
          members: r.members,
          customers: level(r.levels, "customers"),
          orders: level(r.levels, "orders"),
          support: level(r.levels, "support"),
          exports: r.id === "owner" || r.specials["data.export"] === true,
          someStores: r.stores !== "all"
        }))
      } satisfies Inventory
    })
  )
})

interface RequestRow {
  readonly id: string
  readonly kind: "data_request" | "customer_redact" | "shop_redact" | "workspace_export" | "workspace_delete"
  readonly source: "shopify" | "operator" | "insyte"
  readonly state: ShopperRequest["state"]
  readonly subject: string | null
  readonly customerName: string | null
  readonly customerEmail: string | null
  readonly customerShopifyId: string | null
  readonly customerStore: string | null
  readonly storeId: string | null
  readonly requestedBy: string | null
  readonly receivedAt: Date
  readonly dueAt: Date
  readonly completedAt: Date | null
  readonly fileId: string | null
  readonly sizeBytes: string | null
}

const DAY = 24 * 60 * 60 * 1000

/** The requests page's rows: the last hundred of each kind, newest first. */
export const requestRows = (sql: SqlClient.SqlClient) =>
  sql<RequestRow>`
    select g.id, g.kind, g.source, g.state, g.subject, c.name as customer_name, c.email as customer_email,
           g.customer_shopify_id, c.store_id as customer_store, g.store_id, g.requested_by, g.received_at, g.due_at,
           g.completed_at,
           case when f.deleted_at is null then g.file_id end as file_id, f.size_bytes::text as size_bytes
    from gdpr_requests g
    left join customers c on c.id = g.customer_id
    left join files f on f.id = g.file_id
    where g.kind <> 'shop_redact'
    order by g.received_at desc, g.id desc
    limit 300`

/** Exports, their schedule, shoppers' requests and a waiting deletion. */
export const requests = Effect.fn("Privacy.requests")(function*() {
  yield* Policy.require("settings", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [workspace] = yield* sql<{ name: string; exportSchedule: ExportSchedule }>`
        select name, export_schedule from workspaces where id = ${principal.workspaceId}`
      const rows = yield* requestRows(sql)
      const names = yield* actorNames(
        sql,
        rows.flatMap((r) => (r.requestedBy === null ? [] : [{ kind: "member", id: r.requestedBy }]))
      )
      const by = (r: RequestRow) => (r.requestedBy === null ? null : names.get(`member:${r.requestedBy}`) ?? null)
      // Who the shopper is shows only to someone who may see customers, and of the stores their role reaches.
      const seesCustomers = yield* Policy.require("customers", 1).pipe(
        Effect.as(true),
        Effect.catchIf((e): e is Forbidden => e instanceof Forbidden, () => Effect.succeed(false))
      )
      const reach = reachOf(principal)
      const reaches = (store: string | null) => reach === null || (store !== null && reach.includes(store))
      const exports = rows.filter((r) => r.kind === "workspace_export").slice(0, 50).map((r): ExportRow => {
        const expiresAt = r.completedAt === null ? null : r.completedAt.getTime() + EXPORT_DAYS * DAY
        const live = r.state === "ready" && expiresAt !== null && expiresAt > Date.now()
        return {
          id: r.id,
          source: r.source === "insyte" ? "insyte" : "operator",
          state: r.state,
          requestedBy: by(r),
          requestedAt: r.receivedAt.getTime(),
          readyAt: r.completedAt?.getTime() ?? null,
          fileId: live ? r.fileId : null,
          sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes),
          expiresAt
        }
      })
      const shoppers = rows.filter((r) => r.kind === "data_request" || r.kind === "customer_redact").slice(0, 100)
        .map((r): ShopperRequest => ({
          id: r.id,
          kind: r.kind === "data_request" ? "access" : "erasure",
          source: r.source === "shopify" ? "shopify" : "operator",
          subject: !seesCustomers || !reaches(r.storeId ?? r.customerStore) ? null : r.subject ?? r.customerEmail ??
            (r.customerName || null) ?? (r.customerShopifyId === null ? null : `Shopify-klant ${r.customerShopifyId}`),
          state: r.state,
          receivedAt: r.receivedAt.getTime(),
          dueAt: r.dueAt.getTime(),
          completedAt: r.completedAt?.getTime() ?? null,
          fileId: r.fileId
        }))
      const waiting = rows.find((r) =>
        r.kind === "workspace_delete" && (r.state === "waiting" || r.state === "purging")
      )
      const deletion: Deletion | null = waiting === undefined ? null : {
        id: waiting.id,
        requestedAt: waiting.receivedAt.getTime(),
        requestedBy: by(waiting),
        dueAt: waiting.dueAt.getTime(),
        stoppable: waiting.state === "waiting"
      }
      return {
        workspaceName: workspace?.name ?? "",
        schedule: workspace?.exportSchedule ?? "off",
        exports,
        shoppers,
        deletion,
        shoppersHidden: !seesCustomers,
        owner: principal.kind === "member" && principal.role.id === "owner"
      } satisfies PrivacyRequests
    })
  )
})

/**
 * Whether the viewer may download a request's file, within its 7 days: the owner a workspace export; Exporteren and
 * Klanten · Bekijken a shopper's package, when their role reaches every store the package was made from.
 */
export const mayDownload = Effect.fn("Privacy.mayDownload")(function*(sql: SqlClient.SqlClient, requestId: string) {
  const principal = yield* CurrentPrincipal
  const [row] = yield* sql<
    { kind: string; live: boolean; storeId: string | null; stores: ReadonlyArray<string> | null }
  >`
    select kind, store_id, stores,
           coalesce(state = 'ready' and files_removed_at is null
                    and completed_at > now() - make_interval(days => ${EXPORT_DAYS}), false) as live
    from gdpr_requests where id = ${requestId}`
  if (row === undefined || !row.live) return false
  if (row.kind === "workspace_export") return principal.kind === "member" && principal.role.id === "owner"
  if (row.kind !== "data_request") return false
  const allowed = yield* Policy.requireAction("data.export").pipe(
    Effect.andThen(Policy.require("customers", 1)),
    Effect.as(true),
    Effect.catchIf((e): e is Forbidden => e instanceof Forbidden, () => Effect.succeed(false))
  )
  if (!allowed) return false
  const reach = reachOf(principal)
  if (reach === null) return true
  const made = [...(row.stores ?? []), ...(row.storeId === null ? [] : [row.storeId])]
  // Made from every store (`stores` null) is more than a role held to some may have.
  return row.stores !== null && made.every((s) => reach.includes(s))
})
