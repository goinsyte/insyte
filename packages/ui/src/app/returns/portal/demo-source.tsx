import { useParams } from "@tanstack/react-router"
import { type ReactNode, useRef } from "react"
import { deliveriesSeed, designControls, products, stores } from "../../../data-source"
import { resolutionsFor, ruleFor, type ReturnKind, windowCheck, windowDaysFor } from "../../lib/returns"
import type { Order } from "../../lib/types/domain"
import { useReturns } from "../../stores/returns-store"
import { useWorkspace } from "../../stores/workspace-store"
import { type LineRefusal, type PortalLine, type PortalSource, PortalSourceProvider } from "./source"

/*
 * The returns portal over the design app's stores, as it was before the seam (`source.tsx`): the store by a hard-coded
 * handle, the order matched in the browser, the rules worked out here, photos as blob URLs, and the request made in the
 * returns store with the shopper as its first event.
 */

const HANDLES: Record<string, string> = { "northwind-eu": "store_eu", "northwind-us": "store_us" }
const SIZES = ["Klein", "Middel", "Groot"]
const SIZE: Record<string, string> = { s: "Klein", m: "Middel", l: "Groot" }

const HINTS = designControls ? (
  <p className="border-ink/8 border-t pt-3 text-ink-3 text-xs leading-relaxed">
    In de demo: SO-12249 met hannah@example.com (binnen de termijn), SO-12231 met bea@example.com (al aangevraagd), SO-12226 met olivier@example.com (buiten de termijn), SO-12208 met felix@example.com (een claim) of SO-12204 met luca.r@example.com (nog niet bezorgd).
  </p>
) : null

const deliveredOf = (o: Order) => deliveriesSeed[o.id] ?? (o.status === "delivered" ? o.updated_at : undefined)

export function DemoPortalSource({ children }: { children: ReactNode }) {
  const { storeHandle } = useParams({ strict: false }) as { storeHandle?: string }
  const store = stores.find((s) => s.id === (HANDLES[storeHandle ?? ""] ?? null))
  const settings = useReturns((s) => s.settings)
  const records = useReturns((s) => s.records)
  const orders = useWorkspace((s) => s.orders)
  const found = useRef<Order | null>(null)

  /** Per line and kind: may it go back, and if not, why. */
  const refusal = (o: Order, lineId: string, kind: ReturnKind): LineRefusal | null => {
    const line = o.line_items.find((l) => l.id === lineId)
    if (!line) return { kind: "not_delivered" }
    const taken = records.find((r) => r.orderId === o.id && r.status !== "rejected" && r.items.some((i) => i.lineId === lineId))
    if (taken) return { kind: "taken", number: taken.number, status: taken.status }
    const delivered = deliveredOf(o)
    if (!delivered) return { kind: "not_delivered" }
    const days = windowDaysFor(kind, undefined, settings)
    const w = windowCheck(delivered, days, Date.now())
    if (!w.inside) return { kind: "window", days, closesOn: new Date(w.closesOn).toISOString() }
    const p = products.find((x) => x.id === line.product_id)
    const rule = ruleFor(settings.rules, { productId: line.product_id, variantId: line.variant_id, tags: [...(p?.tags ?? []), ...o.tags] })
    if (rule && resolutionsFor(settings.offered, rule, kind).length === 0) return { kind: "rule", note: rule.note }
    return null
  }

  const linesOf = (o: Order): Array<PortalLine> =>
    o.line_items.map((l) => {
      const p = products.find((x) => x.id === l.product_id)
      const size = SIZE[l.variant_id.slice(-1)] ?? l.variant_title
      const rule = ruleFor(settings.rules, { productId: l.product_id, variantId: l.variant_id, tags: [...(p?.tags ?? []), ...o.tags] })
      return {
        id: l.id,
        title: p?.title ?? l.title,
        variantTitle: size,
        unitPrice: l.unit_price,
        image: p?.images[0],
        return: refusal(o, l.id, "return"),
        claim: refusal(o, l.id, "claim"),
        rule: rule ? { kind: rule.kind, note: rule.note } : null,
        exchange: SIZES.filter((s) => s !== size)
      }
    })

  const source: PortalSource = {
    store: store
      ? {
        name: store.name,
        on: settings.portal.on,
        intro: settings.portal.intro,
        done: settings.portal.done,
        returnDays: settings.returnDays,
        claimDays: settings.claimDays,
        reasons: settings.reasons,
        offered: settings.offered,
        giftCardBonus: settings.giftCardBonus,
        claimSteps: settings.claimSteps
      }
      : null,
    hints: HINTS,
    numberPlaceholder: "SO-12231",
    lookup: async (number, email) => {
      const n = number.trim().toUpperCase().replace(/^#/, "")
      const o = orders.find((x) => x.number.toUpperCase() === (n.startsWith("SO-") ? n : `SO-${n}`))
      if (!o || o.customer_email.toLowerCase() !== email.trim().toLowerCase()) return { ok: false, problem: "not_found" }
      found.current = o
      const open = records.find((r) => r.orderId === o.id && r.status !== "resolved" && r.status !== "rejected")
      return {
        ok: true,
        order: {
          number: o.number,
          firstName: o.customer_name.split(" ")[0] ?? "",
          deliveredAt: deliveredOf(o) ?? null,
          currency: o.currency,
          open: open ? { number: open.number, status: open.status, labelCarrier: open.label?.carrier ?? null } : null,
          lines: linesOf(o)
        }
      }
    },
    addPhotos: async (files) => ({ photos: files.map((f) => ({ id: URL.createObjectURL(f), name: f.name, url: URL.createObjectURL(f) })) }),
    submit: async (request) => {
      const order = found.current
      const reason = settings.reasons.find((r) => r.id === request.reasonId)
      if (!order || !reason) return { ok: false, problem: { kind: "expired" } }
      const delivered = deliveredOf(order)
      const picked = linesOf(order).filter((l) => request.lineIds.includes(l.id))
      const rec = useReturns.getState().create(
        {
          kind: request.kind,
          orderId: order.id,
          orderNumber: order.number,
          customerId: order.customer_id,
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          storeId: order.store_id,
          country: order.shipping_address?.country ?? "NL",
          currency: order.currency,
          items: picked.map((p) => {
            const line = order.line_items.find((l) => l.id === p.id)!
            return { lineId: p.id, productId: line.product_id, variantId: line.variant_id, title: p.title, variantTitle: p.variantTitle, qty: 1, unitPrice: p.unitPrice }
          }),
          reason: reason.id,
          note: request.note.trim() || reason.label,
          photos: [...request.photoIds],
          requested: request.resolution,
          exchangeTo: request.resolution === "exchange" ? request.exchangeTo : undefined,
          deliveredAt: delivered ?? new Date().toISOString()
        },
        { at: new Date().toISOString(), who: "shopper", name: order.customer_name, text: request.kind === "claim" ? "Claim gemeld in het retourportaal" : "Retour aangevraagd in het retourportaal" }
      )
      return { ok: true, made: { number: rec.number, kind: rec.kind, requested: rec.requested, exchangeTo: rec.exchangeTo ?? null, mailed: true } }
    }
  }
  return <PortalSourceProvider value={source}>{children}</PortalSourceProvider>
}
