import { type ReactNode, useMemo } from "react"
import { toast } from "sonner"
import { useMyName, useNow } from "../ask/agent-parts"
import { useProducts } from "../hooks/use-operator-data"
import { ME } from "../lib/assignees"
import {
  type Resolution,
  RESOLUTION_LABEL,
  type ReturnRecord,
  ruleFor,
  resolutionsFor,
  windowCheck,
  windowDaysFor
} from "../lib/returns"
import { formatCurrency } from "../lib/format"
import { undoable } from "../lib/undo"
import { useCurrentRole, useGate, useStoreScope } from "../stores/access-store"
import { useReturns } from "../stores/returns-store"
import { useWorkspace } from "../stores/workspace-store"
import { ReturnAgentRows, ReturnProposal } from "./agent-plate"
import { OrderPickDialog, StartReturnDialog } from "./demo-panels"
import { portalHref } from "./returns-screen"
import {
  type ReturnCommands,
  type ReturnDetailSource,
  ReturnDetailSourceProvider,
  type ReturnGates,
  type ReturnsListSource,
  ReturnsListSourceProvider,
  type ReturnSettingsSource,
  ReturnSettingsSourceProvider,
  type ReturnView,
  type Said
} from "./source"

/*
 * The returns screens over the design app's returns store, as they were before the seam (`source.tsx`): the store's
 * records and settings, the access store's gates, and its commands with their Undo, the demo's simulated label and
 * carrier scan, an exchange or replacement as a new order in the workspace, and the agents' plate and rows.
 */

const AGENTS = { Proposal: ReturnProposal, Rows: ReturnAgentRows }

const STORES = [{ value: "store_us", label: "Northwind US" }, { value: "store_eu", label: "Northwind EU" }]

const said = (s: Said, undo: () => void) => undoable(s.label, undo, s.detail)

function useDemoGates(): ReturnGates {
  return { work: useGate("returns", 2), approve: useGate("returns.approve"), manage: useGate("returns", 3) }
}

function useDemoCommands(): ReturnCommands {
  const me = useMyName()
  const store = useReturns.getState
  const event = (text: string) => ({ at: new Date().toISOString(), who: "team" as const, name: me, text })
  return {
    approve: (ids, s, keepItem) => said(s, store().approve(ids, me, keepItem)),
    reject: (ids, reason, s) => said(s, store().reject(ids, reason, me)),
    reopen: (id, s) => said(s, store().advance(id, "review", event("Opnieuw te beoordelen"))),
    receive: (id, s) => said(s, store().advance(id, "received", event("Ontvangen gemarkeerd"))),
    inspect: (id, s) => said(s, store().advance(id, "ready", event("Gecontroleerd: in orde"))),
    assign: (ids, memberId, s) => said(s, store().assign(ids, memberId ?? undefined, me)),
    sendLabel: (ids, s) => said(s, store().sendLabel(ids, me)),
    addTracking: (id, parcel, s) => {
      const before = store().records.find((r) => r.id === id)
      if (!before) return
      useReturns.setState((st) => ({
        records: st.records.map((r) =>
          r.id === id
            ? {
              ...r,
              label: { ...parcel, sentAt: new Date().toISOString(), self: true },
              events: [...r.events, event(`Trackingnummer ingevuld: ${parcel.carrier} ${parcel.tracking}`)]
            }
            : r
        )
      }))
      said(s, () => useReturns.setState((st) => ({ records: st.records.map((r) => (r.id === id ? before : r)) })))
    },
    scan: (r, s) =>
      said(
        s,
        store().advance(r.id, "in_transit", {
          at: new Date().toISOString(),
          who: "carrier",
          name: r.label?.carrier ?? "",
          text: "Pakket aangenomen"
        })
      ),
    settle: (r: ReturnRecord, chosen: Resolution, amount: number) => {
      const money = formatCurrency(amount, r.currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      if (chosen === "exchange" || chosen === "replacement") {
        const ws = useWorkspace.getState()
        const order = ws.createOrder({
          customer_name: r.customerName,
          customer_email: r.customerEmail,
          store: ws.stores.find((s) => s.id === r.storeId)?.name ?? "",
          notes: `${chosen === "exchange" ? "Ruil" : "Vervanging"} voor ${r.number}`,
          items: r.items.map((i) => ({ sku: i.variantId ?? i.lineId, title: i.title, qty: i.qty, price: 0 }))
        })
        useWorkspace.setState((s) => ({
          orders: s.orders.map((o) =>
            o.id === order.id ? { ...o, tags: ["retour"], status: "paid", payment_status: "paid" } : o
          )
        }))
        const undo = store().resolve(r.id, chosen, amount, me, order.number)
        undoable(`${r.number} afgehandeld: ${RESOLUTION_LABEL[chosen].toLowerCase()}`, () => {
          undo()
          ws.removeOrder(order.id)
        }, `Nieuwe bestelling ${order.number} staat klaar om door te sturen.`)
      } else {
        const undo = store().resolve(r.id, chosen, amount, me)
        undoable(
          `${r.number} afgehandeld: ${RESOLUTION_LABEL[chosen].toLowerCase()}`,
          undo,
          chosen === "gift_card" ? `Cadeaubon van ${money} wordt gemaild.` : `Kortingscode ter waarde van ${money} wordt gemaild.`
        )
      }
    },
    refund: (r, amount) => {
      const money = formatCurrency(amount, r.currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      store().resolve(r.id, "refund", amount, me)
      useWorkspace.getState().addOrderNote(r.orderId, `${money} terugbetaald voor ${r.number}`)
      toast(`${money} terugbetaald`, { description: `${r.number} is afgehandeld. ${r.customerName} krijgt een bevestiging.` })
    }
  }
}

/** One return with what the store's rules say about it, worked out here as the page used to. */
function useDemoView(id: string | undefined): ReturnView | undefined {
  const r = useReturns((s) => s.records.find((x) => x.id === id))
  const settings = useReturns((s) => s.settings)
  const all = useReturns((s) => s.records)
  const members = useWorkspace((s) => s.members)
  const { data: products } = useProducts()
  const now = useNow(60_000)
  return useMemo(() => {
    if (!r) return undefined
    const reason = settings.reasons.find((x) => x.id === r.reason)
    const product = products.find((p) => p.id === r.items[0]?.productId)
    const rule = r.items[0]
      ? ruleFor(settings.rules, {
        productId: r.items[0].productId,
        ...(r.items[0].variantId === undefined ? {} : { variantId: r.items[0].variantId }),
        tags: [...(product?.tags ?? []), ...r.tags]
      })
      : undefined
    const assignee = members.find((m) => m.id === r.assignee)
    const address = settings.addresses.find((a) => a.country === r.country) ??
      settings.addresses.find((a) => a.country === (r.storeId === "store_us" ? "US" : "NL")) ?? settings.addresses[0]
    return {
      record: r,
      reasonLabel: reason?.label ?? r.reason,
      photoRequired: reason?.photoRequired ?? false,
      window: windowCheck(r.deliveredAt, windowDaysFor(r.kind, reason, settings), now),
      rule: rule === undefined ? undefined : { kind: rule.kind, note: rule.note },
      offered: resolutionsFor(settings.offered, rule, r.kind),
      earlier: all.filter((x) => x.customerEmail === r.customerEmail && x.id !== r.id).length,
      address: address === undefined ? undefined : { address: address.address, carrier: address.carrier },
      assignee: assignee === undefined ? undefined : { id: assignee.id, name: assignee.name },
      imageOf: (item) => products.find((p) => p.id === item.productId)?.images[0]
    }
  }, [r, settings, all, members, products, now])
}

const useRefundGate = (amount: number) => useGate("refunds.write", amount)

/** The returns screens over the design app's stores. */
export function DemoReturnsSource({ children }: { children: ReactNode }) {
  const all = useReturns((s) => s.records)
  const settings = useReturns((s) => s.settings)
  const scope = useStoreScope()
  const records = useMemo(() => (scope ? all.filter((r) => scope.includes(r.storeId)) : all), [all, scope])
  const members = useWorkspace((s) => s.members)
  const role = useCurrentRole()
  const gates = useDemoGates()
  const commands = useDemoCommands()
  const { data: products } = useProducts()

  const list: ReturnsListSource = {
    records,
    none: all.length === 0,
    reasons: settings.reasons,
    portal: settings.portal,
    portalHref,
    members,
    meId: ME,
    stores: STORES,
    commands,
    gates,
    Pick: OrderPickDialog,
    Start: StartReturnDialog
  }
  const detail: ReturnDetailSource = {
    useView: useDemoView,
    commands,
    gates,
    meId: ME,
    role: { label: role.label, refundLimit: role.refundLimit },
    useRefundGate,
    money: settings,
    agents: AGENTS
  }
  const options: ReturnSettingsSource = {
    saved: settings,
    save: (next, s) => said(s, useReturns.getState().saveSettings(next)),
    gate: gates.manage,
    products: useMemo(() => products.map((p) => ({ id: p.id, title: p.title })), [products]),
    portalHref
  }
  return (
    <ReturnsListSourceProvider value={list}>
      <ReturnDetailSourceProvider value={detail}>
        <ReturnSettingsSourceProvider value={options}>{children}</ReturnSettingsSourceProvider>
      </ReturnDetailSourceProvider>
    </ReturnsListSourceProvider>
  )
}

