import { useNavigate } from "@tanstack/react-router"
import { type ReactNode, useMemo } from "react"
import { toast } from "sonner"
import { Copy, Download, GitMerge, Mail, Send, Tag, Ticket } from "../../icons"
import { OPEN_AS_MODAL } from "../common/detail-shell"
import { useCustomers } from "../hooks/use-operator-data"
import { copyLines, counted, exportCsv } from "../lib/bulk"
import { type DuplicateGroup, findDuplicates } from "../lib/duplicates"
import { formatCurrency } from "../lib/format"
import type { Customer } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { ListClosing, useListStarts } from "../marketing-sections/closings"
import { useWorkspace } from "../stores/workspace-store"
import type { RowAction } from "../table/data-table"
import { KlaviyoDialog } from "./bulk-dialogs"
import { deriveCustomerStatus } from "./customer-status-badge"
import { MergeReview } from "./merge-review"
import { NewCustomerDialog } from "./new-customer-dialog"
import { type CustomerOpeners, type CustomerRow as Row, type CustomersSource, CustomersSourceProvider } from "./source"

/*
 * The customers list's source in the design app: the demo workspace's profiles, their duplicates, the selection bar's
 * actions and the dialogs, as the screen read them before it had a source.
 */

/* The selection bar's actions on customers. Mail goes out through the operator's own client, so
   nothing is sent on their behalf without them pressing send. */

export const demoCustomerActions = (open: CustomerOpeners): ReadonlyArray<RowAction<Row>> => [
  {
    id: "email",
    needs: { perm: "customers", arg: 2 },
    label: "E-mailen",
    icon: Mail,
    group: "Contact",
    shortcut: "m",
    bar: true,
    run: (rows) => {
      window.location.href = `mailto:?bcc=${encodeURIComponent(rows.map((c) => c.email).join(","))}`
    }
  },
  {
    id: "ticket",
    needs: { perm: "support", arg: 2 },
    label: "Ticket per klant openen",
    icon: Ticket,
    group: "Contact",
    shortcut: "t",
    bar: true,
    run: (rows) => {
      const { createTicket } = useWorkspace.getState()
      for (const c of rows) {
        createTicket({
          title: `Opvolgen met ${c.name}`,
          description: `${c.name} (${c.email}) · ${c.orders_count} ${
            c.orders_count === 1 ? "bestelling" : "bestellingen"
          }, ${formatCurrency(c.lifetime_value)} in totaal.`,
          priority: "medium",
          related_entity: { type: "customer", id: c.id, label: c.name }
        })
      }
      toast(`${counted(rows.length, "ticket", "tickets")} geopend op het bord`)
    }
  },
  {
    id: "tag",
    needs: { perm: "customers", arg: 2 },
    label: "Label toevoegen",
    icon: Tag,
    group: "Ordenen",
    shortcut: "g",
    bar: true,
    run: (rows) => open.tag([...rows])
  },
  {
    id: "merge",
    needs: { perm: "customers.merge" },
    label: "Samenvoegen tot één profiel",
    icon: GitMerge,
    group: "Ordenen",
    run: (rows) => open.merge([...rows])
  },
  {
    id: "klaviyo",
    needs: { perm: "customers", arg: 2 },
    label: "Synchroniseren naar Klaviyo",
    icon: Send,
    group: "Contact",
    shortcut: "k",
    run: (rows) => open.klaviyo([...rows])
  },
  {
    id: "copy",
    label: "E-mailadressen kopiëren",
    icon: Copy,
    group: "Exporteren",
    shortcut: "c",
    run: (rows) => copyLines(rows.map((c) => c.email), counted(rows.length, "adres", "adressen"))
  },
  {
    id: "csv",
    needs: { perm: "data.export" },
    label: "Exporteren als CSV",
    icon: Download,
    group: "Exporteren",
    run: (rows) =>
      exportCsv(
        "klanten",
        ["Naam", "E-mail", "Bestellingen", "Klantwaarde", "Status"],
        rows.map((c) => [c.name, c.email, c.orders_count, c.lifetime_value, c.status])
      )
  }
]

function DemoNewCustomer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const createCustomer = useWorkspace((s) => s.createCustomer)
  const removeCustomer = useWorkspace((s) => s.removeCustomer)
  return (
    <NewCustomerDialog
      open={open}
      onOpenChange={onOpenChange}
      onCreate={(input) => {
        const customer = createCustomer({
          name: input.name,
          email: input.email,
          phone: input.phone || undefined,
          tags: input.tags
        })
        undoable(`${customer.name} toegevoegd`, () => removeCustomer(customer.id))
        navigate({ to: "/customers/$customerId", params: { customerId: customer.id }, state: OPEN_AS_MODAL })
      }}
    />
  )
}

/** The demo's last order: a day after the profile's, from its id (the demo seeds no order dates per customer). */
function formatLastOrder(createdAt: string, id: string): string {
  const seed = id.charCodeAt(id.length - 1)
  const d = new Date(createdAt)
  d.setDate(d.getDate() + (seed % 30))
  return new Intl.DateTimeFormat("nl-NL", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  }).format(d)
}

const DEMO_LISTS = [
  { id: "Nieuwsbrief", name: "Nieuwsbrief" },
  { id: "VIP", name: "VIP" },
  { id: "Terugwinnen", name: "Terugwinnen" }
]

/** "Synchroniseren naar Klaviyo" on the demo workspace: simulated, remembered on each profile, with one Undo. */
function DemoKlaviyo(props: { open: boolean; onOpenChange: (open: boolean) => void; picked: Row[] }) {
  const navigate = useNavigate()
  const connected = useWorkspace((s) => s.integrations.some((i) => i.key === "klaviyo" && i.status === "connected"))
  const sync = useWorkspace((s) => s.syncToKlaviyo)
  const restore = useWorkspace((s) => s.restoreCustomers)
  return (
    <KlaviyoDialog
      {...props}
      connected={connected}
      lists={DEMO_LISTS}
      onConnect={() => {
        props.onOpenChange(false)
        void navigate({ to: "/settings/integrations" })
      }}
      onSync={(list) => {
        const before = useWorkspace.getState()
        const snapshot = { e: before.customerEdits, n: before.notDuplicates }
        const ids = props.picked.filter((c) => !c.email.includes("@stripe.com") && !c.email.includes("@paypal.com"))
          .map((c) => c.id)
        sync(ids, list.name)
        undoable(`${ids.length} ${ids.length === 1 ? "klant" : "klanten"} gesynchroniseerd naar ${list.name}`, () =>
          restore(snapshot.e, snapshot.n))
        return Promise.resolve(true)
      }}
    />
  )
}

/** The duplicate review on the demo workspace: merged at once with one Undo, "not the same person" remembered. */
function DemoMerge(
  props: { open: boolean; onOpenChange: (open: boolean) => void; groups: DuplicateGroup[]; customers: Customer[] }
) {
  const merge = useWorkspace((s) => s.mergeCustomers)
  const notDuplicate = useWorkspace((s) => s.notDuplicate)
  return (
    <MergeReview
      {...props}
      onMerge={(keeper, others) => {
        const before = useWorkspace.getState()
        const snapshot = { edits: before.customerEdits, not: before.notDuplicates }
        merge(keeper, others)
        undoable(`${others.length + 1} profielen samengevoegd tot ${keeper.name}`, () =>
          useWorkspace.getState().restoreCustomers(snapshot.edits, snapshot.not))
      }}
      onNotDuplicate={notDuplicate}
    />
  )
}

const DemoClosing = ({ empty }: { empty: boolean }) => <ListClosing area="customers" empty={empty} />
const ALLOWED = { ok: true, reason: "" }

export function DemoCustomersSource({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { data: customers, loading } = useCustomers()
  const notDuplicates = useWorkspace((s) => s.notDuplicates)
  const duplicates = useMemo(() => findDuplicates(customers, notDuplicates), [customers, notDuplicates])
  const starts = useListStarts("customers")
  const source: CustomersSource = {
    customers,
    loading,
    duplicates,
    statusOf: deriveCustomerStatus,
    lastOrder: (c) => formatLastOrder(c.created_at, c.id),
    actions: demoCustomerActions,
    applyTags: (rows, tags, mode) => {
      const ws = useWorkspace.getState()
      const snapshot = { e: ws.customerEdits, n: ws.notDuplicates }
      ws.tagCustomers([...rows], [...tags], mode)
      const n = rows.length
      undoable(
        `${tags.length === 1 ? `“${tags[0]}”` : `${tags.length} labels`} ${
          mode === "add" ? "toegevoegd aan" : "verwijderd van"
        } ${n} ${n === 1 ? "klant" : "klanten"}`,
        () => useWorkspace.getState().restoreCustomers(snapshot.e, snapshot.n)
      )
    },
    canCreate: ALLOWED,
    NewCustomer: DemoNewCustomer,
    Klaviyo: DemoKlaviyo,
    Merge: DemoMerge,
    starts,
    Closing: DemoClosing,
    open: (c) => navigate({ to: "/customers/$customerId", params: { customerId: c.id }, state: OPEN_AS_MODAL })
  }
  return <CustomersSourceProvider value={source}>{children}</CustomersSourceProvider>
}
