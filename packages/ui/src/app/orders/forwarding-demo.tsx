import { type ReactNode, useMemo } from "react"
import { toast } from "sonner"
import { suppliers } from "../../data-source"
import { AgentSuggestion, RecentAgentRow, useMyName, useNow } from "../ask/agent-parts"
import { useProducts } from "../hooks/use-operator-data"
import { counted } from "../lib/bulk"
import { forwardSentence, type ForwardView, inView } from "../lib/forwarding"
import type { QueueRow } from "../lib/queue-row"
import type { Order } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { useGate } from "../stores/access-store"
import { useForwarding, useForwardLegs } from "../stores/forwarding-store"
import { useWorkspace } from "../stores/workspace-store"
import type { Facet } from "../table/data-table"
import { at, ForwardingList, ProcessingTrackerView } from "./forwarding"
import { type ForwardingSource, ForwardingSourceProvider } from "./forwarding-source"

/*
 * The forwarding queue in the design app (PLAN 24): legs from the forwarding store with the supplier's own work laid
 * over them, orders from the workspace store, the agent's plate at Eerst vragen and its log row at Zelf doen, and the
 * order's processing tracker from the same legs.
 */

export const supplierLabel = (id: string) => suppliers.find((s) => s.id === id)?.name ?? NAMES[id] ?? id
const NAMES: Record<string, string> = {
  sup_allure: "Allure Fulfillment",
  sup_dpc: "DPC Apparel",
  sup_kestrel: "Kestrel Goods",
  sup_blackcedar: "Black Cedar Studio"
}

const FACETS: ReadonlyArray<Facet> = [
  { id: "supplier", label: "Leverancier", options: Object.entries(NAMES).map(([value, label]) => ({ value, label })) },
  {
    id: "store",
    label: "Winkel",
    options: [{ value: "store_us", label: "Northwind US" }, { value: "store_eu", label: "Northwind EU" }]
  }
]

/** Every leg with its order and its lines, for one view. */
export function useQueueRows(now: number, view?: ForwardView): QueueRow[] {
  const legs = useForwardLegs(now)
  const orders = useWorkspace((s) => s.orders)
  return useMemo(() => {
    const byId = new Map(orders.map((o) => [o.id, o]))
    return legs.flatMap((l) => {
      if (view && !inView(l.effective, view)) return []
      const order = byId.get(l.orderId)
      if (!order || order.status === "cancelled" || order.status === "refunded") return []
      // After a reroute the lines still belong to the first supplier's products; they travel with the leg.
      const lines = order.line_items.filter((li) => li.supplier_id === (l.from ?? l.supplierId))
      return [{ ...l, order, lines }]
    })
  }, [legs, orders, view])
}

/** A one-second clock only while a send is waiting out its window; otherwise once a minute. */
function useSendingTick() {
  const sending = useForwarding((s) =>
    Object.values(s.overrides).some((l) => l.state === "sending" && (l.sendingUntil ?? 0) > Date.now())
  )
  return sending ? 1000 : 60_000
}

/** The lines the plate rests on, in its chalk: order, supplier, how many. */
function ForwardEvidence({ rows }: { rows: ReadonlyArray<QueueRow> }) {
  const groups = [...new Set(rows.map((r) => r.supplierId))].map((s) => ({
    s,
    rows: rows.filter((r) => r.supplierId === s)
  }))
  return (
    <dl className="grid w-full grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
      {groups.map((g) => (
        <div key={g.s} className="flex min-w-0 flex-col gap-0.5">
          <dt className="truncate text-mesh-ink-2 text-xs">{supplierLabel(g.s)}</dt>
          <dd className="truncate text-mesh-ink tabular-nums">{g.rows.map((r) => r.order.number).join(", ")}</dd>
        </div>
      ))}
    </dl>
  )
}

function DemoPlate({ toForward }: { toForward: ReadonlyArray<QueueRow> }) {
  const proposalKey = `forward:${toForward.map((r) => r.key).sort().join(",")}`
  return (
    <AgentSuggestion
      key={proposalKey}
      id={proposalKey}
      action="ForwardOrder"
      wide
      level={2}
      proposal={{
        title: forwardSentence(toForward),
        body: `Betaald, op voorraad volgens de leveranciers en met een volledig adres. ${
          toForward.map((r) => r.order.number).slice(0, 4).join(", ")
        }${toForward.length > 4 ? " en meer" : ""} gaan via ${
          [...new Set(toForward.map((r) => supplierLabel(r.supplierId)))].join(", ")
        }.`,
        confidence: 92,
        why:
          "Elke bestelling staat al langer dan 30 minuten betaald klaar. Doorsturen kan nog worden ingetrokken tot de leverancier bevestigt.",
        fileLabel: "Doorsturen",
        action: { kind: "open", to: "/orders" }
      }}
      evidence={<ForwardEvidence rows={toForward} />}
      draft={{
        sentence: forwardSentence(toForward).replace(/ doorsturen$/, " doorgestuurd"),
        record: {
          kind: "order",
          label: `${toForward[0]?.order.number ?? ""}${toForward.length > 1 ? ` +${toForward.length - 1}` : ""}`,
          to: "/orders",
          search: { view: "awaiting" }
        },
        trigger: "Betaalde bestellingen",
        sources: toForward.slice(0, 4).map((r) => ({
          kind: "order" as const,
          title: r.order.number,
          detail: `${supplierLabel(r.supplierId)} · ${r.lines.length} ${r.lines.length === 1 ? "regel" : "regels"}`,
          to: `/orders/${r.order.id}`
        })),
        reason: "Betaald, adres compleet en de leverancier meldt voorraad.",
        compensation: "Terughalen"
      }}
      perform={() => {
        // The plate is one decision, so it is one log row over every leg; its undo takes them all back.
        const keys = toForward.map((r) => r.key)
        useForwarding.getState().forwardLegs(keys, "Insyte", undefined, 0)
        return { effect: { kind: "order.forward", keys }, after: `${toForward.length} wachten op bevestiging` }
      }}
    />
  )
}

const DemoRecent = () => <RecentAgentRow action="ForwardOrder" />

export function DemoForwardingSource({ children }: { children: ReactNode }) {
  const now = useNow(useSendingTick())
  const all = useQueueRows(now)
  const { data: products } = useProducts()
  const me = useMyName()
  const edit = useGate("orders", 2)
  const mail = useGate("support", 2)
  const prefs = useForwarding((s) => s.prefs)
  const source: ForwardingSource = {
    now,
    all,
    supplierLabel,
    imageOf: (line) => products.find((p) => p.id === line.product_id)?.images[0],
    facets: FACETS,
    gates: { edit },
    viaOf: (supplierId) => prefs[supplierId]?.via ?? "portal",
    forward: (legs, via, note) => {
      const undo = useForwarding.getState().forwardLegs(
        legs.map((r) => r.key),
        me,
        via
      )
      const sentence = forwardSentence(legs)
      undoable(
        "Wordt doorgestuurd…",
        undo,
        `${sentence.replace(/ doorsturen$/, "")}. Ongedaan maken kan tot het vertrekt.`
      )
      if (note) {
        for (const r of legs) {
          useWorkspace.getState().addOrderNote(
            r.orderId,
            `Notitie voor ${supplierLabel(r.supplierId)}: ${note}`
          )
        }
      }
    },
    confirm: (picked) => {
      const undos = picked.map((r) => useForwarding.getState().confirmLeg(r.key, me))
      undoable(
        `${counted(picked.length, "bestelling", "bestellingen")} als bevestigd gemarkeerd`,
        () => undos.forEach((u) => u()),
        "Voor als de leverancier buiten Insyte om bevestigde."
      )
    },
    rerouteOptions: (row) =>
      Object.keys(NAMES).filter((s) => s !== row.supplierId).map((id) => ({ id, name: supplierLabel(id) })),
    reroute: (row, pick) => {
      const undo = useForwarding.getState().rerouteLeg(row.key, pick, me)
      undoable(`${row.order.number} gaat naar ${supplierLabel(pick)}`, undo, "Staat bij Te versturen.")
    },
    cancelOrder: (cancelling) => {
      useForwarding.getState().cancelLeg(cancelling.key, me)
      useWorkspace.getState().cancelOrder(cancelling.order.id)
      toast(`${cancelling.order.number} geannuleerd`, { description: "De klant krijgt bericht van Shopify." })
    },
    mail: {
      gate: mail,
      send: (row, subj) => {
        const order = row.order
        let sent = true
        toast("Wordt verstuurd…", {
          description: `Aan ${order.customer_name}: ${subj}`,
          duration: 6000,
          action: { label: "Ongedaan maken", onClick: () => (sent = false) },
          onAutoClose: () => {
            if (sent) useWorkspace.getState().addOrderNote(order.id, `Klant gemaild: ${subj}`)
          }
        })
      }
    },
    Plate: DemoPlate,
    Recent: DemoRecent
  }
  return <ForwardingSourceProvider value={source}>{children}</ForwardingSourceProvider>
}

/** The orders screen's forwarding views in the design app. */
export function DemoForwarding({ view }: { view: ForwardView }) {
  return (
    <DemoForwardingSource>
      <ForwardingList view={view} />
    </DemoForwardingSource>
  )
}

/**
 * Verwerking, above the lines on an order: Betaald → Naar leverancier → Bevestigd → Verzonden →
 * Bezorgd, one track per supplier when the order has lines from two, each step with its time and
 * who did it. A failed step says why in red. Vertical under `sm`.
 */
export function ProcessingTracker({ order }: { order: Order }) {
  const now = useNow(useSendingTick())
  const legs = useForwardLegs(now).filter((l) => l.orderId === order.id)
  const work = useWorkspace((s) => s.supplierWork)
  const supplierIds = [...new Set(order.line_items.map((l) => l.supplier_id ?? "").filter(Boolean))]
  if (supplierIds.length === 0 || order.status === "cancelled") return null
  const tracks = supplierIds.map((s) => {
    const leg = legs.find((l) => (l.from ?? l.supplierId) === s)
    const w = work[`${order.id}|${s}`]
    const shipped = w?.parcels[0]?.at ??
      (order.status === "shipped" || order.status === "delivered" ? order.updated_at : undefined)
    const delivered = order.status === "delivered" ? order.updated_at : undefined
    const state = leg?.effective ??
      (shipped ? "confirmed" : order.status === "at_supplier" ? "confirmed" : "to_forward")
    const reached = delivered
      ? 5
      : shipped
      ? 4
      : state === "confirmed"
      ? 3
      : state === "awaiting" || state === "sending" || state === "error"
      ? 2
      : 1
    const detail: Array<string | undefined> = [
      at(order.created_at),
      reached >= 2
        ? [leg?.since && state !== "confirmed" ? at(leg.since) : undefined, leg?.by].filter(Boolean).join(" · ") ||
          undefined
        : undefined,
      reached >= 3
        ? [at(w?.accepted_at ?? (state === "confirmed" ? leg?.since : undefined)), supplierLabel(leg?.supplierId ?? s)]
          .filter(Boolean).join(" · ")
        : undefined,
      reached >= 4 ? [at(shipped), w?.parcels[0]?.carrier ?? order.carrier].filter(Boolean).join(" · ") : undefined,
      reached >= 5 ? at(delivered) : undefined
    ]
    return { s: leg?.supplierId ?? s, from: leg?.from, leg, state, reached, detail }
  })
  return <ProcessingTrackerView tracks={tracks} now={now} supplierLabel={supplierLabel} />
}
