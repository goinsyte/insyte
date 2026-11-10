import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { TicketList, TicketOptions } from "@insyte/modules/tickets/domain/Tickets"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import type { TicketView } from "@insyte/ui/app/lib/ticket-source"
import type { TicketSource } from "@insyte/ui/app/lib/types/domain"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { type TicketsSearch, TicketsSourceProvider } from "@insyte/ui/app/tickets/source"
import { TicketsPage } from "@insyte/ui/app/tickets/tickets-screen"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { ticketAtom, ticketOptionsAtom, ticketsAtom } from "../data/tickets.ts"
import { useConsoleTicketsSource } from "../tickets/tickets-source.tsx"

/**
 * Tickets (step 13.3, M11 step 3): the reference's board and lists over `Tickets.list`, in the frame, with the ticket
 * opened over them as a modal (`?ticket=`). The loader reads the tickets and what "Nieuw ticket" offers on the server,
 * and the open ticket too where the address names one; until they are in, the reference's board skeleton stands in. A
 * role that may not see tickets is told which permission it misses.
 */

const VIEWS: ReadonlyArray<TicketView> = ["open", "mine", "unassigned", "snoozed", "done", "archived", "trash", "spam"]
const SOURCES: ReadonlyArray<TicketSource> = ["gmail", "outlook", "shopify", "klarna", "chat", "insyte", "manual"]

const pick = <A extends string>(raw: unknown, allowed: ReadonlyArray<A>): A | undefined =>
  allowed.find((a) => a === raw)

export const Route = createFileRoute("/_frame/tickets")({
  validateSearch: (s: Record<string, unknown>): TicketsSearch => {
    const view = pick(s["view"], VIEWS)
    const source = pick(s["source"], SOURCES)
    return {
      ...(typeof s["ticket"] === "string" ? { ticket: s["ticket"] } : {}),
      ...(view === undefined ? {} : { view }),
      ...(source === undefined ? {} : { source })
    }
  },
  head: () => ({ meta: [{ title: "Tickets · Insyte" }] }),
  loaderDeps: ({ search }) => ({ ticket: search.ticket }),
  loader: async ({ context, deps }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(ticketsAtom)
    context.registry.mount(ticketOptionsAtom)
    const open = deps.ticket === undefined || typeof window !== "undefined" ? undefined : ticketAtom(deps.ticket)
    if (open !== undefined) context.registry.mount(open)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, ticketsAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, ticketOptionsAtom)),
        ...(open === undefined ? [] : [Effect.ignore(AtomRegistry.getResult(context.registry, open))])
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: Pending,
  component: TicketsLayout
})

function TicketsLayout() {
  return (
    <>
      <TicketsRoute />
      <Outlet />
    </>
  )
}

function Pending() {
  return <PageSkeleton kind="board" title="Tickets" />
}

const isForbidden = Schema.is(Forbidden)

function TicketsRoute() {
  const result = useAtomValue(ticketsAtom)
  const options = Option.getOrUndefined(AsyncResult.value(useAtomValue(ticketOptionsAtom)))
  // A refresh keeps showing the board as it was until the new one is in.
  const list = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (list !== undefined) return <Loaded list={list} options={options} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <DeniedPanel
        title="Je rol kan de tickets niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Tickets.list"
        }}
      />
    )
  }
  return <Pending />
}

function Loaded({ list, options }: { list: TicketList; options: TicketOptions | undefined }) {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const source = useConsoleTicketsSource(
    list,
    options,
    search,
    (id) => void navigate({ search: (s) => ({ ...s, ticket: id ?? undefined }) })
  )
  return (
    <TicketsSourceProvider value={source}>
      <TicketsPage />
    </TicketsSourceProvider>
  )
}
