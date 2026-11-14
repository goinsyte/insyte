import { useAtomValue } from "@effect/atom-react"
import type { CustomerDraft } from "@insyte/modules/forwarding/domain/CustomerDraft"
import type { LegList, LegRow as ServerLeg } from "@insyte/modules/forwarding/domain/Forwarding"
import { useNow } from "@insyte/ui/app/hooks/use-now"
import type { ForwardView } from "@insyte/ui/app/lib/forwarding"
import { VIEW_LABEL } from "@insyte/ui/app/lib/forwarding"
import type { QueueRow } from "@insyte/ui/app/lib/queue-row"
import type { Currency, Order } from "@insyte/ui/app/lib/types/domain"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { at, ForwardingList, ProcessingTrackerView, type TrackerTrack } from "@insyte/ui/app/orders/forwarding"
import {
  type ForwardingSource,
  ForwardingSourceProvider,
  type ServedDraft
} from "@insyte/ui/app/orders/forwarding-source"
import { Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useMemo } from "react"
import { customerDraftAtom, forwardingAtom, orderLegsAtom, orderTrackingAtom } from "../data/forwarding.ts"
import { suppliersAtom } from "../data/suppliers.ts"
import { useGate } from "../frame/refusals.ts"
import { useForwardingCommands } from "./forwarding-writes.ts"
import { useOrderCommands } from "./order-writes.ts"

/*
 * The forwarding queue's source in the console (M8.2): `Forwarding.list`'s legs as the design's rows. "Klant mailen"
 * opens on Insyte's draft (`Forwarding.customerDraft`, M8 10.2a) and sends it with `Orders.emailCustomer`, with its
 * undo. What the server does not hold yet is left out: the agent's plate and log row (M15).
 * A forward's "Wordt doorgestuurd…" turns into "Wacht op bevestiging" when its window closes, as the design's does.
 */

const iso = (ms: number) => new Date(ms).toISOString()

/** A server leg as the design's queue row, at `now`. */
const queueRowOf = (l: ServerLeg, now: number): QueueRow => {
  const lines = l.lines.map((x) => ({
    id: x.id,
    product_id: x.productId ?? "",
    variant_id: "",
    title: x.title,
    ...(x.variantTitle === null ? {} : { variant_title: x.variantTitle }),
    quantity: x.quantity,
    unit_price: 0
  }))
  const order: Order = {
    id: l.orderId,
    number: l.orderNumber,
    store_id: l.storeId,
    shopify_id: "",
    customer_id: "",
    customer_name: l.customerName,
    customer_email: "",
    status: "paid",
    payment_status: "paid",
    fulfillment_status: "unfulfilled",
    total: l.totalMinor / 100,
    currency: l.currency as Currency,
    line_items: lines,
    tags: [],
    created_at: iso(l.since),
    updated_at: iso(l.since)
  }
  const effective = l.state === "sending" && l.sendingUntil !== null && l.sendingUntil <= now ? "awaiting" : l.state
  return {
    key: l.id,
    orderId: l.orderId,
    supplierId: l.supplier?.id ?? "",
    state: l.state,
    effective,
    since: iso(l.since),
    via: l.via ?? undefined,
    reason: l.errorKind ?? undefined,
    reasonNow: l.errorKind ?? undefined,
    by: l.forwardedBy === "system" ? "Insyte" : undefined,
    sendingUntil: l.sendingUntil ?? undefined,
    from: l.fromSupplier?.id,
    note: l.errorNote ?? undefined,
    order,
    lines
  }
}

const valueOf = <A, E>(result: AsyncResult.AsyncResult<A, E>) => Option.getOrUndefined(AsyncResult.value(result))

const NO_DRAFT = Atom.make(AsyncResult.initial<CustomerDraft, never>())

/** Insyte's draft for the row's shopper: the dialog sends only once it is in, never a placeholder. */
const useDraft = (row: QueueRow | null): ServedDraft => {
  const result = useAtomValue(row === null ? NO_DRAFT : customerDraftAtom(row.key))
  if (AsyncResult.isFailure(result)) return "failed"
  return valueOf(result) ?? "loading"
}

/** Supplier names from the legs, and from the suppliers the role may see (who else could take a leg). */
function useSuppliers(legs: ReadonlyArray<ServerLeg>) {
  const list = valueOf(useAtomValue(suppliersAtom))
  return useMemo(() => {
    const names = new Map<string, string>()
    for (const l of legs) {
      if (l.supplier) names.set(l.supplier.id, l.supplier.name)
      if (l.fromSupplier) names.set(l.fromSupplier.id, l.fromSupplier.name)
    }
    for (const s of list?.rows ?? []) names.set(s.id, s.name)
    return { names, rows: list?.rows ?? [] }
  }, [legs, list])
}

function useConsoleForwardingSource(list: LegList): ForwardingSource {
  const sending = list.rows.some((l) => l.state === "sending" && (l.sendingUntil ?? 0) > Date.now())
  const now = useNow(sending ? 1000 : 60_000)
  const all = useMemo(() => list.rows.map((l) => queueRowOf(l, now)), [list, now])
  const images = useMemo(() => new Map(list.rows.flatMap((l) => l.lines.map((x) => [x.id, x.image]))), [list])
  const suppliers = useSuppliers(list.rows)
  const commands = useForwardingCommands()
  const orders = useOrderCommands()
  const edit = useGate("orders", 2)
  const mail = useGate("support", 2)
  const label = (id: string) => suppliers.names.get(id) ?? "Geen leverancier"
  return {
    now,
    all,
    supplierLabel: label,
    imageOf: (line) => images.get(line.id) ?? undefined,
    facets: [{
      id: "supplier",
      label: "Leverancier",
      options: [...new Set(all.map((r) => r.supplierId))].map((value) => ({ value, label: label(value) }))
    }],
    gates: { edit },
    viaOf: (supplierId) => suppliers.rows.find((s) => s.id === supplierId)?.forwardChannel ?? "email",
    forward: (rows, via, note) => void commands.forward(rows, via, note),
    confirm: (rows) => void commands.confirm(rows),
    rerouteOptions: (row) =>
      suppliers.rows.filter((s) => s.id !== row.supplierId && s.pausedAt === null).map((s) => ({
        id: s.id,
        name: s.name
      })),
    reroute: (row, supplierId) => void commands.reroute(row, supplierId, label(supplierId)),
    cancelOrder: (row) => void orders.cancel(row.order),
    mail: {
      gate: mail,
      send: (row, subject, body) => void orders.emailCustomer(row.orderId, subject, body, row.order.customer_name),
      useDraft
    }
  }
}

function Loaded({ list, view }: { list: LegList; view: ForwardView }) {
  return (
    <ForwardingSourceProvider value={useConsoleForwardingSource(list)}>
      <ForwardingList view={view} />
    </ForwardingSourceProvider>
  )
}

/** The orders screen's forwarding views in the console (its `Forwarding` slot). */
export function ConsoleForwarding({ view }: { view: ForwardView }) {
  const list = valueOf(useAtomValue(forwardingAtom))
  return list === undefined
    ? <PageSkeleton kind="table" title={VIEW_LABEL[view]} />
    : <Loaded list={list} view={view} />
}

/** Verwerking on an order (the order page's `Tracker` slot): its legs from `Forwarding.forOrder`. */
export function ConsoleTracker({ order }: { order: Order }) {
  const legs = valueOf(useAtomValue(orderLegsAtom(order.id))) ?? []
  const tracking = valueOf(useAtomValue(orderTrackingAtom(order.id)))
  const now = useNow(60_000)
  const suppliers = useSuppliers(legs)
  if (legs.length === 0 || order.status === "cancelled") return null
  // The parcels' own times (M8.4): the first one sent, and when the last one arrived.
  const first = tracking?.parcels.find((p) => p.shippedAt !== null)
  const shipped = first?.shippedAt != null
    ? iso(first.shippedAt)
    : order.status === "shipped" || order.status === "delivered"
    ? order.updated_at
    : undefined
  const delivered = tracking?.deliveredAt != null
    ? iso(tracking.deliveredAt)
    : order.status === "delivered"
    ? order.updated_at
    : undefined
  const carrier = first?.carrier ?? order.carrier
  const tracks: Array<TrackerTrack> = legs.map((l) => {
    const leg = queueRowOf(l, now)
    const state = leg.effective
    const reached = delivered
      ? 5
      : shipped
      ? 4
      : state === "confirmed"
      ? 3
      : state === "awaiting" || state === "sending" || state === "error"
      ? 2
      : 1
    return {
      s: leg.supplierId,
      from: leg.from,
      leg,
      state,
      reached,
      detail: [
        at(order.created_at),
        reached >= 2
          ? [state !== "confirmed" ? at(leg.since) : undefined, leg.by].filter(Boolean).join(" · ") || undefined
          : undefined,
        reached >= 3
          ? [at(state === "confirmed" ? leg.since : undefined), suppliers.names.get(leg.supplierId)].filter(Boolean)
            .join(" · ")
          : undefined,
        reached >= 4 ? [at(shipped), carrier].filter(Boolean).join(" · ") : undefined,
        reached >= 5 ? at(delivered) : undefined
      ]
    }
  })
  return (
    <ProcessingTrackerView
      tracks={tracks}
      now={now}
      supplierLabel={(id) => suppliers.names.get(id) ?? "Geen leverancier"}
    />
  )
}
