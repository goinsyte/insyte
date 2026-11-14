import { type ReactNode, useMemo, useRef, useState } from "react"
import { messagesByConversation, suppliers } from "../../data-source"
import { Upload, X } from "../../icons"
import { AttachmentTile, forget, fromFiles } from "../chats/attachments"
import { useProducts as useDemoProducts } from "../hooks/use-operator-data"
import { type DemoSupplierOrder, useDemoSupplierOrders } from "../hooks/use-supplier-orders"
import { HISTORY } from "../lib/analytics/history"
import { stockOf, unitsOf } from "../lib/catalog"
import { formatCurrency } from "../lib/format"
import { DEFAULT_LEAD_DAYS } from "../lib/supplier-products"
import { ME_SUPPLIER } from "../lib/supplier-work"
import type { Product } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { SupplierClosing } from "../marketing-sections/closings"
import { SupplierChecks, SupplierCheckWork } from "../quality/supplier-checks"
import { useChatStore } from "../stores/chat-store"
import { useSupplier } from "../stores/supplier-store"
import { useWorkspace } from "../stores/workspace-store"
import { downloadPackingSlips } from "./packing-slip"
import {
  type PackingSlip,
  type SupplierDashboardView,
  type SupplierOrderRow,
  type SupplierOrderView,
  SupplierPortalProvider,
  type SupplierPortalSource,
  type SupplierProductRow
} from "./source"

/*
 * The portal in the design app: Marco Rossi at Allure Fulfillment, working for Northwind, out of the demo stores. What
 * the brand sees of it (accepted, shipped, a problem, the stock) is in the workspace store, so the brand's own screens
 * show it too.
 */

const BRAND = "Northwind"
const BRAND_LEGAL = "Northwind Clothing Co."
const short = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" })

const isOpen = (r: SupplierOrderRow) => r.status === "to_accept" || r.status === "to_ship"

function slipOf({ row, order }: DemoSupplierOrder): PackingSlip {
  const a = order.shipping_address
  return {
    number: row.number,
    lines: row.lines,
    shipTo: {
      name: order.customer_name,
      line1: a?.line1 ?? "",
      line2: a?.line2 ?? null,
      postcode: a?.postal_code ?? "",
      city: a?.city ?? "",
      country: a?.country ?? ""
    }
  }
}

function viewOf(d: DemoSupplierOrder): SupplierOrderView {
  const { row, order, work } = d
  return {
    row,
    placedAt: order.created_at,
    acceptedAt: work?.accepted_at,
    problem: work?.problem ? { kind: work.problem.kind, note: work.problem.note, at: work.problem.at } : undefined,
    parcels: (work?.parcels ?? []).map((p) => ({ id: p.id, carrier: p.carrier, tracking: p.tracking, at: p.at })),
    shippedAs: order.tracking_number ? { carrier: order.carrier, tracking: order.tracking_number } : undefined,
    shipTo: slipOf(d).shipTo,
    note: order.notes
  }
}

/** The supplier's products, with what the demo stores changed about them. */
function useDemoProductRows(): { rows: Array<SupplierProductRow>; byId: Map<string, Product> } {
  const { data: products } = useDemoProducts()
  const edits = useWorkspace((s) => s.productEdits)
  const media = useWorkspace((s) => s.productMedia)
  const indicators = useSupplier((s) => s.indicators)
  const orders = useDemoSupplierOrders()
  const fallback = suppliers.find((s) => s.id === ME_SUPPLIER.id)?.stock_indicator ?? "live"
  return useMemo(() => {
    const mine = products.filter((p) => p.supplier_id === ME_SUPPLIER.id && p.status !== "archived")
    return {
      byId: new Map(mine.map((p) => [p.id, p])),
      rows: mine.map((p) => ({
        id: p.id,
        title: p.title,
        image: p.images[0],
        variants: p.variants.length,
        units: unitsOf(p),
        stock: stockOf(p),
        lead: edits[p.id]?.leadDays ?? DEFAULT_LEAD_DAYS,
        mode: indicators[p.id] ?? fallback,
        open: orders.filter((d) => isOpen(d.row) && d.row.lines.some((l) => l.productId === p.id)).length,
        media: media[p.id]?.length ?? 0
      }))
    }
  }, [products, edits, media, indicators, orders, fallback])
}

/** On time against the promise, week by week, over this supplier's own delivered parcels. */
function usePerformance() {
  return useMemo(() => {
    const mine = HISTORY.orders.filter((o) => o.supplier === ME_SUPPLIER.id && o.arrived !== undefined)
    const end = Date.parse("2026-05-26T00:00:00Z")
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const to = end - (7 - i) * 7 * 86_400_000
      const from = to - 6 * 86_400_000
      const xs = mine.filter((o) => {
        const t = Date.parse(`${o.arrived}T00:00:00Z`)
        return t >= from && t <= to
      })
      const late = xs.filter((o) => o.took! > o.promised).length
      return {
        label: short.format(new Date(to)),
        onTime: xs.length === 0 ? 0 : Math.round(((xs.length - late) / xs.length) * 1000) / 10,
        n: xs.length,
        late
      }
    })
    const last30 = mine.filter((o) => Date.parse(`${o.arrived}T00:00:00Z`) > end - 30 * 86_400_000)
    const late30 = last30.filter((o) => o.took! > o.promised)
    return {
      weeks,
      onTime30: last30.length === 0 ? 0 : Math.round(((last30.length - late30.length) / last30.length) * 1000) / 10,
      parcels30: last30.length,
      lateBy: late30.length === 0 ?
        0 :
        Math.round((late30.reduce((n, o) => n + o.took! - o.promised, 0) / late30.length) * 10) / 10,
      measure: "Op tijd bezorgd",
      until: "26 mei"
    }
  }, [])
}

function useDemoDashboard(): SupplierDashboardView {
  const rows = useDemoSupplierOrders().map((d) => d.row)
  const { rows: products } = useDemoProductRows()
  const { data: catalogue } = useDemoProducts()
  const extra = useChatStore((s) => s.extra.conv_supplier_allure)
  const performance = usePerformance()
  const active = new Set(catalogue.filter((p) => p.status === "active").map((p) => p.id))
  const rank = (r: SupplierOrderRow) => r.due === "late" ? 0 : r.due === "today" ? 1 : r.status === "to_accept" ? 2 : 3
  // The last word in the shared #allure-fulfillment thread, whoever had it.
  const last = [...(messagesByConversation.conv_supplier_allure ?? []), ...(extra ?? [])].at(-1)
  return {
    counts: {
      accept: rows.filter((r) => r.status === "to_accept").length,
      today: rows.filter((r) => isOpen(r) && r.due === "today").length,
      late: rows.filter((r) => isOpen(r) && r.due === "late").length,
      problem: rows.filter((r) => r.status === "problem").length
    },
    fresh: rows.length === 0,
    work: rows.filter(isOpen).sort((a, b) => rank(a) - rank(b) || a.handoff.getTime() - b.handoff.getTime()).slice(
      0,
      7
    ),
    low: products
      .filter((p) => active.has(p.id) && p.stock !== "available")
      .map((p) => ({ id: p.id, title: p.title, units: p.units }))
      .sort((a, b) => a.units - b.units)
      .slice(0, 4),
    performance,
    lastMessage: {
      who: last?.sender_id === "u_marco" ? "Jij" : (last?.sender_name ?? BRAND),
      body: last?.body ?? "",
      at: last?.at ?? new Date().toISOString()
    }
  }
}

/** Photos and videos for the brand, shared at once from a product's page. */
function DemoProductMedia({ productId }: { productId: string }) {
  const media = useWorkspace((s) => s.productMedia[productId]) ?? []
  const addMedia = useWorkspace((s) => s.addProductMedia)
  const removeMedia = useWorkspace((s) => s.removeProductMedia)
  const file = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function upload(files: FileList | Array<File>) {
    const items = fromFiles(files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"))
    if (items.length === 0) return
    addMedia(productId, items, "Marco Rossi")
    undoable(`${items.length} ${items.length === 1 ? "bestand" : "bestanden"} gedeeld met ${BRAND}`, () => {
      for (const it of items) removeMedia(productId, it.id)
    })
  }

  return (
    <section aria-labelledby="media-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="media-title" className="font-medium text-ink text-lg">
          Foto's en video's voor {BRAND}
        </h2>
        <p className="text-ink-3 text-sm">
          {BRAND} ziet ze bij het product en kan ze in de winkel en in advertenties gebruiken.
        </p>
      </div>
      <button
        type="button"
        onClick={() => file.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          upload(e.dataTransfer.files)
        }}
        className={cn(
          "flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-mist text-ink-2 text-sm transition-colors hover:bg-ink/6",
          dragging && "bg-arc-tint text-arc-ink ring-2 ring-arc"
        )}
      >
        <Upload className="size-4" strokeWidth={1.75} />
        {dragging ? "Loslaten om te delen" : "Sleep foto's of video's hierheen, of kies ze"}
      </button>
      <input
        ref={file}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) upload(e.target.files)
          e.target.value = ""
        }}
      />
      {media.length > 0 ?
        (
          <ul className="flex flex-wrap gap-3">
            {media.map((m) => (
              <li key={m.id} className="group relative">
                <AttachmentTile a={m} />
                <button
                  type="button"
                  aria-label={`${m.name} verwijderen`}
                  onClick={() => {
                    removeMedia(productId, m.id)
                    forget(m.id)
                  }}
                  className="absolute top-1.5 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md bg-paper/90 text-ink-2 opacity-0 shadow-sm transition-opacity hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="size-3.5" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        ) :
        null}
    </section>
  )
}

export function DemoSupplierPortal({ children }: { children: ReactNode }) {
  const accept = useWorkspace((s) => s.acceptSupplierOrders)
  const shipParcel = useWorkspace((s) => s.shipSupplierParcel)
  const reportProblem = useWorkspace((s) => s.reportSupplierProblem)
  const snapshot = useWorkspace((s) => s.supplierSnapshot)
  const restore = useWorkspace((s) => s.restoreSupplier)
  const edits = useWorkspace((s) => s.productEdits)
  const editProducts = useWorkspace((s) => s.editProducts)
  const restoreProducts = useWorkspace((s) => s.restoreProducts)
  const setIndicator = useSupplier((s) => s.setIndicator)
  const demo = useDemoSupplierOrders()

  const source: SupplierPortalSource = {
    brand: BRAND,
    brandLegal: BRAND_LEGAL,
    firstName: "Marco",
    money: (amount) => formatCurrency(amount),
    useOrders: () => useDemoSupplierOrders().map((d) => d.row),
    useOrder: (id) => {
      const d = useDemoSupplierOrders().find((x) => x.row.id === id)
      return d === undefined ? undefined : viewOf(d)
    },
    useProducts: () => useDemoProductRows().rows,
    useProduct: (id) => {
      const { rows, byId } = useDemoProductRows()
      const orders = useDemoSupplierOrders()
      const row = rows.find((r) => r.id === id)
      const product = byId.get(id)
      if (row === undefined || product === undefined) return undefined
      return {
        row,
        images: product.images,
        variants: product.variants.map((v) => ({
          id: v.id,
          title: v.title,
          sku: v.sku ?? v.id,
          stock: v.inventory_level
        })),
        waiting: orders
          .filter((d) => isOpen(d.row) && d.row.lines.some((l) => l.productId === id))
          .map((d) => ({
            id: d.row.id,
            number: d.row.number,
            quantity: d.row.lines.filter((l) => l.productId === id).reduce((n, l) => n + l.quantity, 0),
            handoff: d.row.handoff
          }))
      }
    },
    useDashboard: useDemoDashboard,
    accept: (rows, said) => {
      const before = snapshot()
      accept(ME_SUPPLIER.id, rows.map((r) => r.id))
      undoable(said.message, () => restore(before), said.description)
    },
    ship: (items, carrier, said) => {
      const before = snapshot()
      for (const { row, tracking } of items) {
        shipParcel(ME_SUPPLIER.id, row.id, { carrier, tracking, lines: row.lines.map((l) => l.id) })
      }
      undoable(said.message, () => restore(before), said.description)
    },
    report: (row, problem, said) => {
      const before = snapshot()
      reportProblem(ME_SUPPLIER.id, ME_SUPPLIER.name, row.id, {
        kind: problem.kind,
        note: problem.note,
        newDate: problem.newDate ? new Date(`${problem.newDate}T17:00:00`).toISOString() : undefined
      })
      undoable(said.message, () => restore(before), said.description)
    },
    packingSlips: (rows) => {
      const ids = new Set(rows.map((r) => r.id))
      downloadPackingSlips(demo.filter((d) => ids.has(d.row.id)).map(slipOf), BRAND_LEGAL)
    },
    saveStock: (product, stock, lead, said) => {
      const before = edits
      editProducts({ [product.row.id]: { variantStock: stock, leadDays: lead } })
      undoable(said.message, () => restoreProducts(before), said.description)
    },
    setMode: (product, mode) => setIndicator(product.id, mode),
    modeOff: () => null,
    parts: {
      CheckWork: SupplierCheckWork,
      Checks: SupplierChecks,
      Media: DemoProductMedia,
      Closing: SupplierClosing,
      chat: true,
      settings: true
    }
  }
  return <SupplierPortalProvider value={source}>{children}</SupplierPortalProvider>
}
