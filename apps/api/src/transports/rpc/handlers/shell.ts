import { Frame, ShellRpcs } from "@insyte/api/rpc/ShellRpcs"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { CustomersService } from "@insyte/modules/customers/Customers"
import { Members } from "@insyte/modules/members/Members"
import { NotificationsService } from "@insyte/modules/notifications/NotificationsService"
import { OrdersService } from "@insyte/modules/orders/Orders"
import { PrefsService } from "@insyte/modules/prefs/PrefsService"
import { ProductsService } from "@insyte/modules/products/Products"
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

/** The area a path is in: its first segment. */
const areaOf = (path: string) => path.split("/").find((segment) => segment !== "") ?? "dashboard"

export const ShellHandlers = ShellRpcs.toLayer(Effect.gen(function*() {
  const members = yield* Members
  const notes = yield* NotificationsService
  const prefs = yield* PrefsService
  const workspaces = yield* Workspaces
  const orders = yield* OrdersService
  const products = yield* ProductsService
  const customers = yield* CustomersService
  const tickets = yield* TicketsService
  const SEARCHES = {
    order: (q: string, limit: number) => orders.search(q, limit),
    product: (q: string, limit: number) => products.search(q, limit),
    customer: (q: string, limit: number) => customers.search(q, limit)
  } as const

  const countsFor = (area: string) => {
    if (area === "tickets") {
      return tickets.counts.pipe(
        Effect.map((counts) => ({
          ...Object.fromEntries(Object.entries(TICKET_CUTS).map(([key, view]) => [key, counts[view]])),
          ...Object.fromEntries(Object.entries(counts.bySource).map(([source, n]) => [`/tickets?source=${source}`, n]))
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
    "Shell.frame": ({ path }) =>
      Effect.gen(function*() {
        const principal = yield* CurrentPrincipal
        const user = yield* CurrentUser
        const [memberships, mine, counts, teammates, nav] = yield* Effect.all([
          workspaces.memberships,
          prefs.get,
          notes.counts,
          members.directory,
          countsFor(areaOf(path))
        ], { concurrency: 1 })
        const workspace = memberships.find((m) => m.workspaceId === principal.workspaceId)
        return new Frame({
          workspace: { id: principal.workspaceId, name: workspace?.workspaceName ?? "" },
          me: { memberId: principal.id, name: user.name, email: user.email, image: user.image },
          role: principal.role,
          prefs: mine,
          notes: counts,
          teammates,
          counts: nav,
          proposals: null
        })
      }),
    "Nav.counts": ({ area }) => countsFor(area),
    "Search.records": ({ q, kinds, limit }) =>
      Effect.forEach(kinds ?? (["order", "customer", "product"] as const), (kind) => SEARCHES[kind](q, limit ?? 5), {
        concurrency: 1
      }).pipe(Effect.map((perKind) => perKind.flat()))
  })
}))
