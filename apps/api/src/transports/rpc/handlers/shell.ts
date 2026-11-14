import { Frame, ShellRpcs } from "@insyte/api/rpc/ShellRpcs"
import type { Forbidden } from "@insyte/domain/Errors"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { ChargebacksService } from "@insyte/modules/chargebacks/Chargebacks"
import { ChatsService } from "@insyte/modules/chats/Chats"
import { CustomersService } from "@insyte/modules/customers/Customers"
import { InboxService } from "@insyte/modules/inbox/Inbox"
import { Members } from "@insyte/modules/members/Members"
import { NotificationsService } from "@insyte/modules/notifications/NotificationsService"
import { OrdersService } from "@insyte/modules/orders/Orders"
import { PrefsService } from "@insyte/modules/prefs/PrefsService"
import { ProductsService } from "@insyte/modules/products/Products"
import { ReturnsService } from "@insyte/modules/returns/Returns"
import type { SearchKind } from "@insyte/modules/shared/domain/Search"
import { StoresService } from "@insyte/modules/stores/Stores"
import { TicketsService } from "@insyte/modules/tickets/Tickets"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect } from "effect"

/*
 * The frame, composed here from the slices it shows (a slice never reads another): the workspace and role from the
 * principal, the member's preferences, their notification counts and the team's faces, all at once.
 */

/**
 * The panel's cuts the server counts, per area (each area's step adds its own: tickets in M11, …), keyed as the panel
 * keys them (`countKey`). Orders (M6.4): open is everything not yet shipped; "delayed" and "at supplier" wait for M8.
 */
const ORDER_CUTS: Record<string, ReadonlyArray<string>> = {
  "/orders?status=open": ["placed", "paid", "at_supplier"],
  "/orders?status=processing": ["at_supplier"],
  "/orders?status=shipped": ["shipped"],
  "/orders?status=cancelled": ["cancelled"]
}

/** Tickets (M11 step 3): each view of the panel by its link, and each source's open tickets. */
const TICKET_CUTS = {
  "/tickets": "all",
  "/tickets?view=mine": "mine",
  "/tickets?view=unassigned": "unassigned",
  "/tickets?view=snoozed": "snoozed",
  "/tickets?view=done": "done",
  "/tickets?view=archived": "archived",
  "/tickets?view=spam": "spam",
  "/tickets?view=trash": "trash"
} as const

/** The inbox (M11 step 2): each folder of the panel by its link, and each mailbox's threads in the inbox. */
const INBOX_CUTS = {
  "/inbox": "all",
  "/inbox?folder=unassigned": "unassigned",
  "/inbox?folder=mine": "mine",
  "/inbox?folder=linked": "linked",
  "/inbox?folder=archive": "archive",
  "/inbox?folder=trash": "trash",
  "/inbox?folder=spam": "spam"
} as const

/** Returns (M9.1): each view of the panel by its link, and all of them; the list's own counts. */
const RETURN_CUTS = {
  "/returns": "total",
  "/returns?view=review": "review",
  "/returns?view=awaiting": "awaiting",
  "/returns?view=received": "received",
  "/returns?view=ready": "ready",
  "/returns?view=resolved": "resolved",
  "/returns?view=rejected": "rejected",
  "/returns?view=returns": "returns",
  "/returns?view=claims": "claims"
} as const

/** Klanten (M6.4): the segments the server can tell, new and returning ("VIP"); "Risico" waits for its signal. */
const CUSTOMER_CUTS = {
  "/customers?segment=new": "new",
  "/customers?segment=vip": "returning"
} as const

/** Producten (M7, M9.4): per status, and the Aandacht cuts. Leveranciers shares the panel, so the counts too. */
const PRODUCT_CUTS = {
  "/products?status=active": "active",
  "/products?status=draft": "draft",
  "/products?status=archived": "archived",
  "/products?status=attention_returns": "attentionReturns",
  "/products?status=attention_complaints": "attentionComplaints",
  "/products?status=attention_checks": "attentionChecks"
} as const

/** Chargebacks (M13): each tab of the panel by its link. */
const CHARGEBACK_CUTS = {
  "/chargebacks?tab=action_required": "actionRequired",
  "/chargebacks?tab=submitted": "submitted",
  "/chargebacks?tab=won": "won",
  "/chargebacks?tab=lost": "lost"
} as const

/** Each key of `cuts` with its count from `counts`. */
const keyed = <K extends string>(cuts: Readonly<Record<string, K>>, counts: Readonly<Record<K, number>>) =>
  Object.fromEntries(Object.entries(cuts).map(([key, field]) => [key, counts[field as K]])) as Record<string, number>

/** A role that cannot see an area gets no counts for it, not a refusal: the panel just shows none. */
const none = <R>(read: Effect.Effect<Record<string, number>, Forbidden, R>) =>
  read.pipe(Effect.catchTag("Forbidden", () => Effect.succeed({} as Record<string, number>)))

export const ShellHandlers = ShellRpcs.toLayer(Effect.gen(function*() {
  const members = yield* Members
  const notes = yield* NotificationsService
  const prefs = yield* PrefsService
  const workspaces = yield* Workspaces
  const orders = yield* OrdersService
  const products = yield* ProductsService
  const customers = yield* CustomersService
  const tickets = yield* TicketsService
  const inbox = yield* InboxService
  const chats = yield* ChatsService
  const chargebacks = yield* ChargebacksService
  const stores = yield* StoresService
  const returns = yield* ReturnsService
  // Each kind through its own slice, which answers nothing where the role may not look (support level, stores, a DM).
  const SEARCHES = {
    order: (q: string, limit: number) => orders.search(q, limit),
    product: (q: string, limit: number) => products.search(q, limit),
    customer: (q: string, limit: number) => customers.search(q, limit),
    ticket: (q: string, limit: number) => tickets.search(q, limit),
    thread: (q: string, limit: number) => inbox.search(q, limit),
    message: (q: string, limit: number) => chats.search(q, limit),
    chargeback: (q: string, limit: number) => chargebacks.search(q, limit)
  } as const
  const EVERY: ReadonlyArray<SearchKind> = ["order", "customer", "product", "ticket", "thread", "message", "chargeback"]

  // One read per area, on that area's pages only, each fenced to the principal's stores by its slice.
  const areaCounts = (area: string) => {
    switch (area) {
      case "returns":
        return returns.counts.pipe(Effect.map((c) => keyed(RETURN_CUTS, c)), none)
      case "customers":
        return customers.counts.pipe(Effect.map((c) => keyed(CUSTOMER_CUTS, c)), none)
      case "products":
      case "suppliers":
        return products.counts.pipe(Effect.map((c) => keyed(PRODUCT_CUTS, c)), none)
      case "chargebacks":
        return chargebacks.counts.pipe(Effect.map((c) => keyed(CHARGEBACK_CUTS, c)), none)
      default:
        return undefined
    }
  }

  const countsFor = (area: string) => {
    const read = areaCounts(area)
    if (read !== undefined) return read
    if (area === "tickets") {
      return tickets.counts.pipe(
        Effect.map((counts) => ({
          ...Object.fromEntries(Object.entries(TICKET_CUTS).map(([key, view]) => [key, counts[view]])),
          ...Object.fromEntries(Object.entries(counts.bySource).map(([source, n]) => [`/tickets?source=${source}`, n]))
        })),
        Effect.catchTag("Forbidden", () => Effect.succeed({} as Record<string, number>))
      )
    }
    if (area === "inbox") {
      return inbox.counts.pipe(
        Effect.map((counts) => ({
          ...Object.fromEntries(Object.entries(INBOX_CUTS).map(([key, folder]) => [key, counts[folder]])),
          ...Object.fromEntries(Object.entries(counts.byMailbox).map(([id, n]) => [`/inbox?mailbox=${id}`, n]))
        })),
        Effect.catchTag("Forbidden", () => Effect.succeed({} as Record<string, number>))
      )
    }
    if (area !== "orders") return Effect.succeed({} as Record<string, number>)
    return orders.statusCounts.pipe(
      Effect.map((byStatus) =>
        Object.fromEntries(
          Object.entries(ORDER_CUTS).map((
            [key, statuses]
          ) => [key, statuses.reduce((n, s) => n + (byStatus[s] ?? 0), 0)])
        )
      ),
      // A role that cannot see the orders gets no counts, not a refusal: the panel just shows none.
      Effect.catchTag("Forbidden", () => Effect.succeed({} as Record<string, number>))
    )
  }

  return ShellRpcs.of({
    "Shell.frame": () =>
      Effect.gen(function*() {
        const principal = yield* CurrentPrincipal
        const user = yield* CurrentUser
        const [memberships, mine, counts, teammates, health] = yield* Effect.all([
          workspaces.memberships,
          prefs.get,
          notes.counts,
          members.directory,
          stores.healthLine
        ], { concurrency: 1 })
        const workspace = memberships.find((m) => m.workspaceId === principal.workspaceId)
        return new Frame({
          workspace: { id: principal.workspaceId, name: workspace?.workspaceName ?? "" },
          me: { memberId: principal.id, name: user.name, email: user.email, image: user.image },
          role: principal.role,
          prefs: mine,
          notes: counts,
          teammates,
          proposals: null,
          health
        })
      }),
    "Shell.health": () => stores.healthLine,
    "Nav.counts": ({ area }) => countsFor(area),
    "Search.records": ({ q, kinds, limit }) =>
      Effect.forEach(new Set(kinds ?? EVERY), (kind) => SEARCHES[kind](q, limit ?? 5), {
        concurrency: 1
      }).pipe(Effect.map((perKind) => perKind.flat()))
  })
}))
