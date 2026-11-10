import { useNavigate } from "@tanstack/react-router"
import { useMemo } from "react"
import { toast } from "sonner"
import { products as catalogue } from "../../data-source"
import { RecordAgentRows } from "../ask/agent-parts"
import { formatCurrency } from "../lib/format"
import type { Customer, Order } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { OrderReturns, StartReturnDialog } from "../returns/demo-panels"
import { useGate } from "../stores/access-store"
import { useWorkspace } from "../stores/workspace-store"
import { type OrderDetailSource, OrderDetailSourceProvider, type TimelineStep } from "./detail-source"
import { ProcessingTracker } from "./forwarding-demo"
import { formatLong, OrderDetailPage } from "./order-screen"

/*
 * One order's source in the design app: the demo workspace's order as the screen read it before it had a source.
 * The supplier is picked from the order's id, the shipping and the tax are a share of what the lines leave, and the
 * address falls back to a Brooklyn street, as they did; every write changes the workspace and offers Undo.
 */

const SUPPLIERS = ["Skyway Freight", "Oceanic Logistics", "City Couriers", "Delta Transport", "Express Carriers"]

/** A line item's photograph, from the product it was sold as. */
const imageOf = (productId: string) => catalogue.find((p) => p.id === productId)?.images[0]

/** A line item's SKU, from the variant it was sold as. */
const skuOf = (variantId: string) => catalogue.flatMap((p) => p.variants).find((v) => v.id === variantId)?.sku

function buildTimeline(order: Order): TimelineStep[] {
  const placed: TimelineStep = {
    kind: "placed",
    done: true,
    label: "Bestelling geplaatst",
    detail: formatLong(order.created_at)
  }
  const paid: TimelineStep = { kind: "paid", done: true, label: "Betaling geïnd", detail: "Stripe" }
  const atSupplier: TimelineStep = {
    kind: "supplier",
    done: ["at_supplier", "shipped", "delivered"].includes(order.status),
    label: "Bij leverancier",
    detail: "Bestelling geaccepteerd door leverancier"
  }
  const shipped: TimelineStep = {
    kind: "shipped",
    done: ["shipped", "delivered"].includes(order.status),
    label: "Verzonden",
    detail: order.tracking_number
      ? `${order.carrier ?? "Vervoerder"} · ${order.tracking_number}`
      : "Opgehaald door vervoerder"
  }
  const delivered: TimelineStep = {
    kind: "delivered",
    done: order.status === "delivered",
    label: "Bezorgd",
    detail: order.status === "delivered" ? "Bevestigd" : "In afwachting"
  }
  if (order.status === "cancelled" || order.status === "refunded") {
    const terminal: TimelineStep = {
      kind: "closed",
      done: true,
      label: order.status === "cancelled" ? "Geannuleerd" : "Terugbetaald",
      detail: "Door beheerder"
    }
    return [placed, paid, terminal]
  }
  return [placed, paid, atSupplier, shipped, delivered]
}

const DemoAgentRows = ({ order }: { order: Order }) => <RecordAgentRows kind="order" id={order.id} />
const RETURNS = { Dialog: StartReturnDialog, Panel: OrderReturns }

export function DemoOrderDetail({ id, customer }: { id: string; customer: Customer | undefined }) {
  const stored = useWorkspace((s) => s.orders.find((o) => o.id === id)) as Order
  const orders = useWorkspace((s) => s.orders)
  const refundOrder = useWorkspace((s) => s.refundOrder)
  const cancelOrder = useWorkspace((s) => s.cancelOrder)
  const restoreOrder = useWorkspace((s) => s.restoreOrder)
  const updateShipping = useWorkspace((s) => s.updateShipping)
  const addOrderNote = useWorkspace((s) => s.addOrderNote)
  const createTicket = useWorkspace((s) => s.createTicket)
  const navigate = useNavigate()
  const edit = useGate("orders", 2)
  const refund = useGate("refunds.write", stored.total)
  const returns = useGate("returns", 2)
  const known = useMemo(() => orders.flatMap((o) => o.tags), [orders])

  // The address as the screen drew it: the demo's own, or a street in Brooklyn.
  const order: Order = {
    ...stored,
    shipping_address: {
      line1: stored.shipping_address?.line1 ?? "120 Main St",
      city: stored.shipping_address?.city ?? "Brooklyn",
      region: stored.shipping_address?.region ?? "NY",
      postal_code: stored.shipping_address?.postal_code ?? "11201",
      country: stored.shipping_address?.country ?? "US"
    }
  }
  const subtotal = stored.line_items.reduce((sum, li) => sum + li.unit_price * li.quantity, 0)
  const shipping = Math.round((stored.total - subtotal) * 0.3 * 100) / 100

  const source: OrderDetailSource = {
    order,
    customer: customer
      ? { orders_count: customer.orders_count, lifetime_value: customer.lifetime_value, phone: customer.phone }
      : undefined,
    imageOf: (li) => imageOf(li.product_id),
    skuOf: (li) => (li.variant_id ? (skuOf(li.variant_id) ?? li.variant_id) : li.product_id),
    totals: { subtotal, shipping, tax: Math.max(0, stored.total - subtotal - shipping), discount: 0 },
    timeline: buildTimeline(stored),
    payment: { method: "Stripe", collectedAt: stored.created_at },
    supplier: SUPPLIERS[Number.parseInt(stored.id.slice(-2), 10) % SUPPLIERS.length],
    tags: {
      known,
      write: (tags, message) => {
        const before = stored.tags
        useWorkspace.setState((s) => ({
          orders: s.orders.map((o) => (o.id === stored.id ? { ...o, tags, updated_at: new Date().toISOString() } : o))
        }))
        undoable(
          message,
          () =>
            useWorkspace.setState((s) => ({
              orders: s.orders.map((o) => (o.id === stored.id ? { ...o, tags: before } : o))
            }))
        )
      }
    },
    writes: {
      gates: { edit, refund, returns },
      fulfil: () => {
        const before = stored
        useWorkspace.setState((s) => ({
          orders: s.orders.map((o) =>
            o.id === stored.id
              ? { ...o, status: "shipped", fulfillment_status: "fulfilled", updated_at: new Date().toISOString() }
              : o
          )
        }))
        undoable(`${stored.number} als afgehandeld gemarkeerd`, () => restoreOrder(before))
      },
      refund: () => {
        refundOrder(stored.id)
        toast.success(`${stored.number} terugbetaald`, {
          description: `${formatCurrency(stored.total, stored.currency)} aan ${stored.customer_name}`
        })
      },
      // Irreversible (ADR-0023): the dialog asked first, so there is no undo.
      cancel: () => {
        if (cancelOrder(stored.id)) {
          toast.success(`${stored.number} geannuleerd`, {
            description: "De afhandeling is gestopt en de klant is op de hoogte."
          })
        }
      },
      saveNote: (note) => {
        addOrderNote(stored.id, note)
        toast.success("Notitie opgeslagen")
      },
      saveShipping: (address) => {
        const before = stored
        updateShipping(stored.id, address)
        undoable("Verzendadres bijgewerkt", () => restoreOrder(before))
      },
      draftSupplierMessage: (supplier) => {
        const ticket = createTicket({
          title: `Overdrachtsdatum bevestigen met ${supplier} voor ${stored.number}`,
          description:
            `${supplier} verwerkt ${stored.number} trager dan normaal. Vraag om de overdrachtsdatum en het track & trace-nummer en laat het ${stored.customer_name} weten zodra je het hebt.`,
          priority: "high",
          related_entity: { type: "order", id: stored.id, label: stored.number }
        })
        toast.success(`Opgesteld als ${ticket.number}`, {
          description: "Controleer het voordat het naar de leverancier gaat.",
          action: { label: "Openen", onClick: () => navigate({ to: "/tickets", search: { ticket: ticket.id } }) }
        })
      }
    },
    Tracker: ProcessingTracker,
    AgentRows: DemoAgentRows,
    Returns: RETURNS
  }
  return (
    <OrderDetailSourceProvider value={source}>
      <OrderDetailPage />
    </OrderDetailSourceProvider>
  )
}
