import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { CustomerPage } from "@insyte/modules/customers/domain/Customers"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { OPEN_AS_MODAL, useOpenedAsModal } from "@insyte/ui/app/common/detail-shell"
import { KlaviyoDialog } from "@insyte/ui/app/customers/bulk-dialogs"
import { CustomersPage } from "@insyte/ui/app/customers/customers-screen"
import { MergeReview } from "@insyte/ui/app/customers/merge-review"
import { NewCustomerDialog } from "@insyte/ui/app/customers/new-customer-dialog"
import { type CustomerRow, CustomersSourceProvider } from "@insyte/ui/app/customers/source"
import type { DuplicateGroup } from "@insyte/ui/app/lib/duplicates"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import type { Currency, Customer } from "@insyte/ui/app/lib/types/domain"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { useCustomerCommands } from "../customers/customer-writes.ts"
import { useConsoleCustomersSource } from "../customers/customers-source.ts"
import { type Preview, useKlaviyo } from "../customers/klaviyo.ts"
import { customersAtom } from "../data/customers.ts"

/**
 * Klanten (step 8.4c, M6.4): the reference's customers list over `Customers.list`, in the frame. The loader reads them
 * on the server; until they are in, the reference's table skeleton stands in. A role that may not see customers is
 * told which permission it misses.
 *
 * The list is this layout rather than `/customers/`, as with Bestellingen, so a row opened over it (step 8.4e) leaves its
 * filters, sort and scroll as they were; a customer reached by its URL is a page with nothing read behind it.
 */
export const Route = createFileRoute("/_frame/customers")({
  validateSearch: (s: Record<string, unknown>): { segment?: string } =>
    typeof s["segment"] === "string" ? { segment: s["segment"] } : {},
  head: () => ({ meta: [{ title: "Klanten · Insyte" }] }),
  loader: async ({ context, location }) => {
    if (!atList(location.pathname)) return
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(customersAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, customersAtom)))
  },
  pendingComponent: Pending,
  component: Layout
})

const atList = (pathname: string) => pathname.replace(/\/$/, "") === "/customers"

function Layout() {
  const asModal = useOpenedAsModal()
  const atIndex = useRouterState({ select: (s) => atList(s.location.pathname) })
  return (
    <>
      {atIndex || asModal ? <CustomersRoute /> : null}
      <Outlet />
    </>
  )
}

function Pending() {
  return <PageSkeleton kind="table" title="Klanten" />
}

const isForbidden = Schema.is(Forbidden)

function CustomersRoute() {
  const result = useAtomValue(customersAtom)
  const page = AsyncResult.isSuccess(result)
    ? result.value
    : AsyncResult.isWaiting(result)
    ? Option.getOrUndefined(AsyncResult.value(result))
    : undefined
  if (page !== undefined) return <Loaded page={page} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <DeniedPanel
        title="Je rol kan de klanten niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Customers.list"
        }}
      />
    )
  }
  return <Pending />
}

/**
 * "Synchroniseren naar Klaviyo" in the design's dialog (M7.5): who may go from a dry run when it opens, the account's
 * lists, and the sync with its undo; connecting goes to Klaviyo and comes back here.
 */
function ConsoleKlaviyo(props: { open: boolean; onOpenChange: (open: boolean) => void; picked: Array<CustomerRow> }) {
  const klaviyo = useKlaviyo()
  const [preview, setPreview] = useState<Preview | undefined>(undefined)
  const ids = props.picked.map((c) => c.id).join(",")
  // biome-ignore lint/correctness/useExhaustiveDependencies: asked once per opening and selection
  useEffect(() => {
    setPreview(undefined)
    if (props.open && klaviyo.connected) void klaviyo.preview(ids.split(",")).then(setPreview)
  }, [props.open, klaviyo.connected, ids])
  return (
    <KlaviyoDialog
      {...props}
      connected={klaviyo.connected}
      lists={klaviyo.lists}
      preview={preview}
      onConnect={() => void klaviyo.connect()}
      onSync={(list, withTags) => klaviyo.sync(ids.split(","), list, withTags)}
    />
  )
}

/** Back from Klaviyo's approval page: said once, and the address cleaned. */
function useKlaviyoReturn() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const connected = url.searchParams.get("connected") === "klaviyo"
    const error = url.searchParams.get("error")?.startsWith("klaviyo_") === true
    if (!connected && !error) return
    if (connected) {
      toast.success("Klaviyo gekoppeld", { description: "Kies klanten en synchroniseer ze naar een lijst." })
    } else {toast.error("Klaviyo is niet gekoppeld", {
        description: "De goedkeuring kwam niet terug. Probeer het nog eens."
      })}
    url.searchParams.delete("connected")
    url.searchParams.delete("error")
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`)
  }, [])
}

function Loaded({ page }: { page: CustomerPage }) {
  useKlaviyoReturn()
  const navigate = useNavigate()
  const source = useConsoleCustomersSource(
    page,
    (row) => navigate({ to: "/customers/$customerId", params: { customerId: row.id }, state: OPEN_AS_MODAL })
  )
  // "Klant toevoegen" and the duplicate review in the design's dialogs, done by the customer commands (M7.4). One
  // component each for the page's life, so a refetch behind an open dialog does not remount it.
  const commands = useCustomerCommands()
  const currency = page.rows[0]?.currency as Currency | undefined
  const latest = useRef(commands)
  latest.current = commands
  const dialogs = useMemo(() => ({
    NewCustomer: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
      <NewCustomerDialog
        open={open}
        onOpenChange={onOpenChange}
        onCreate={(input) =>
          void latest.current.create(input).then((id) => {
            if (id !== undefined) {
              void navigate({ to: "/customers/$customerId", params: { customerId: id }, state: OPEN_AS_MODAL })
            }
          })}
      />
    ),
    Merge: (props: {
      open: boolean
      onOpenChange: (open: boolean) => void
      groups: Array<DuplicateGroup>
      customers: Array<Customer>
    }) => (
      <MergeReview
        {...props}
        onMerge={(keeper, others) => void latest.current.merge(keeper, others)}
        onNotDuplicate={(key) => void latest.current.markNotDuplicate(key)}
        currency={currency}
      />
    )
  }), [navigate, currency])
  return (
    <CustomersSourceProvider
      value={{ ...source, ...(source.canCreate.ok ? dialogs : { Merge: dialogs.Merge }), Klaviyo: ConsoleKlaviyo }}
    >
      <CustomersPage />
    </CustomersSourceProvider>
  )
}
