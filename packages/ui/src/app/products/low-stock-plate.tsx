import { useNavigate } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { suppliers } from "../../data-source"
import { sellThrough, stockOf, unitsOf } from "../lib/catalog"
import type { Product } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import type { Decision } from "../stores/ask-store"
import { useWorkspace } from "../stores/workspace-store"
import { LowStockAdvice, whenOf } from "./low-stock-advice"

/**
 * The low-stock advice, drawn the way Insyte draws every proposal: a plate, with the evidence in it
 * and the decision at its foot. It picks the product that runs out soonest at its own pace — units on
 * hand over units sold a day — and proposes the two things that stop it costing orders: pause the
 * ads that are still sending buyers to it, and ask the supplier for a restock date. Filing does both,
 * with Undo; Discard leaves everything as it is. Nothing is decided until the operator files it. This is
 * the design app's host, over the demo workspace; the plate itself is `LowStockAdvice`.
 */
export function LowStockPlate({ products }: { products: ReadonlyArray<Product> }) {
  const orders = useWorkspace((s) => s.orders)
  const edits = useWorkspace((s) => s.productEdits)
  const navigate = useNavigate()
  const [decided, setDecided] = useState<Record<string, Decision>>({})

  const pick = useMemo(() => {
    const candidates = products
      .filter((p) =>
        p.status !== "archived" && stockOf(p) !== "available" && (!edits[p.id]?.adsPaused || decided[p.id])
      )
      .map((p) => ({ p, ...sellThrough(p, orders) }))
      .filter((c) => c.daysLeft !== null || unitsOf(c.p) === 0)
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    return candidates.find((c) => decided[c.p.id] !== "discarded") ?? null
  }, [products, orders, edits, decided])

  if (!pick) return null
  const { p, perDay, daysLeft } = pick
  const supplier = suppliers.find((s) => s.id === p.supplier_id)
  const units = unitsOf(p)
  const openOrders = orders.filter(
    (o) =>
      o.line_items.some((li) => li.product_id === p.id) && !["delivered", "cancelled", "refunded"].includes(o.status)
  ).length
  const when = whenOf(units, daysLeft)

  return (
    <LowStockAdvice
      pick={{
        title: p.title,
        image: p.images[0],
        units,
        perDay,
        daysLeft,
        openOrders,
        supplierName: supplier?.name
      }}
      ads
      decision={decided[p.id] ?? "open"}
      onFile={() => {
        const ws = useWorkspace.getState()
        const before = ws.productEdits
        ws.editProducts({ [p.id]: { adsPaused: true } })
        const ticket = ws.createTicket({
          title: `${p.title} bijbestellen bij ${supplier?.name ?? "de leverancier"}`,
          description: `${p.title} ${when} (${units} op voorraad, ${
            perDay.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
          } verkocht per dag). Advertenties staan op pauze tot het terug is. Vraag wanneer er nieuwe voorraad komt.`,
          priority: units === 0 ? "high" : "medium",
          status: "awaiting_reply",
          tags: ["Leverancier"]
        })
        setDecided((d) => ({ ...d, [p.id]: "filed" }))
        undoable(`Advertenties voor ${p.title} gepauzeerd, bijbestelling gevraagd in ${ticket.number}`, () => {
          useWorkspace.getState().restoreProducts(before)
          useWorkspace.setState((s) => ({ tickets: s.tickets.filter((t) => t.id !== ticket.id) }))
          setDecided((d) => ({ ...d, [p.id]: "open" }))
        })
      }}
      onDiscard={() => setDecided((d) => ({ ...d, [p.id]: "discarded" }))}
      onEdit={() => navigate({ to: "/products/$productId", params: { productId: p.id } })}
    />
  )
}
