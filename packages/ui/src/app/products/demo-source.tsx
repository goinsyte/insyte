import { useNavigate } from "@tanstack/react-router"
import { type ReactNode, useMemo } from "react"
import { toast } from "sonner"
import { suppliers } from "../../data-source"
import { Archive, BadgePercent, Check, Copy, Download, Edit3, Truck } from "../../icons"
import { OPEN_AS_MODAL } from "../common/detail-shell"
import { useProducts } from "../hooks/use-operator-data"
import { copyLines, counted, exportCsv } from "../lib/bulk"
import { categoryOf, marginOf, stockOf, unitsOf } from "../lib/catalog"
import { formatCurrency } from "../lib/format"
import type { Product } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { ListClosing, useListStarts } from "../marketing-sections/closings"
import { useAllComplaints, useQuality } from "../stores/quality-store"
import { useReturns } from "../stores/returns-store"
import { useWorkspace } from "../stores/workspace-store"
import type { Facet, RowAction } from "../table/data-table"
import { LowStockPlate } from "./low-stock-plate"
import { MarginDialog } from "./margin-dialog"
import { NewProductDialog } from "./new-product-dialog"
import { type ProductRow as Row, type ProductsSource, ProductsSourceProvider } from "./source"

/*
 * The products list's source in the design app: the demo catalogue with its derived figures, the attention the
 * returns queue and the quality checks give each product, the selection bar's actions and the dialogs, as the screen
 * read them before it had a source.
 */

/* A status change on picked products, with one Undo for the lot. */
function setStatus(rows: ReadonlyArray<Row>, status: Product["status"]) {
  const ws = useWorkspace.getState()
  const before = ws.productEdits
  ws.editProducts(Object.fromEntries(rows.map((r) => [r.id, { status }])))
  const verb = status === "archived" ? "gearchiveerd" : status === "active" ? "op actief gezet" : "op concept gezet"
  undoable(
    `${counted(rows.length, "product", "producten")} ${verb}`,
    () => useWorkspace.getState().restoreProducts(before)
  )
}

/* The selection bar's actions on products. A restock request is a ticket on the board, addressed
   to the supplier, so it is followed up like every other piece of work. */
export const demoProductActions = (openMargins: (rows: Row[]) => void): ReadonlyArray<RowAction<Row>> => [
  {
    id: "restock",
    needs: { perm: "products", arg: 2 },
    label: "Bijbestelling aanvragen",
    icon: Truck,
    group: "Leveranciers",
    shortcut: "r",
    bar: true,
    applies: (p) => p.stock !== "available",
    run: (rows) => {
      const { createTicket } = useWorkspace.getState()
      for (const p of rows) {
        createTicket({
          title: `${p.title} bijbestellen bij ${p.supplierName}`,
          description: `${p.title} (${p.sku}) is ${
            p.stock === "out" ? "uitverkocht" : "bijna op"
          }. Vraag ${p.supplierName} wanneer er nieuwe voorraad komt.`,
          priority: p.stock === "out" ? "high" : "medium"
        })
      }
      toast(`${counted(rows.length, "bijbestelling", "bijbestellingen")} opgesteld op het bord`)
    }
  },
  {
    id: "margins",
    label: "Marges herberekenen",
    icon: BadgePercent,
    group: "Prijzen",
    shortcut: "p",
    bar: true,
    run: (rows) => openMargins([...rows])
  },
  {
    id: "active",
    needs: { perm: "products", arg: 2 },
    label: "Op actief zetten",
    icon: Check,
    group: "Status",
    applies: (p) => p.status !== "active",
    run: (rows) => setStatus(rows, "active")
  },
  {
    id: "draft",
    needs: { perm: "products", arg: 2 },
    label: "Op concept zetten",
    icon: Edit3,
    group: "Status",
    applies: (p) => p.status !== "draft",
    run: (rows) => setStatus(rows, "draft")
  },
  {
    id: "archive",
    needs: { perm: "products", arg: 3 },
    label: "Archiveren",
    icon: Archive,
    group: "Status",
    applies: (p) => p.status !== "archived",
    destructive: true,
    run: (rows) => setStatus(rows, "archived")
  },
  {
    id: "copy",
    label: "SKU's kopiëren",
    icon: Copy,
    group: "Exporteren",
    shortcut: "c",
    bar: true,
    run: (rows) => copyLines(rows.map((p) => p.sku), counted(rows.length, "SKU", "SKU's"))
  },
  {
    id: "csv",
    needs: { perm: "data.export" },
    label: "Exporteren als CSV",
    icon: Download,
    group: "Exporteren",
    run: (rows) =>
      exportCsv(
        "producten",
        ["Product", "SKU", "Leverancier", "Prijs", "Marge", "Voorraad"],
        rows.map((p) => [p.title, p.sku, p.supplierName, p.price, p.margin, p.stock ?? ""])
      )
  }
]

const FACETS: ReadonlyArray<Facet> = [
  {
    id: "stock",
    label: "Voorraad",
    options: [
      { value: "available", label: "Op voorraad" },
      { value: "low", label: "Lage voorraad" },
      { value: "out", label: "Uitverkocht" }
    ]
  },
  {
    id: "supplier",
    label: "Leverancier",
    options: suppliers.map((s) => ({ value: s.name, label: s.name }))
  }
]

function DemoNewProduct({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createProduct = useWorkspace((s) => s.createProduct)
  const removeProduct = useWorkspace((s) => s.removeProduct)
  return (
    <NewProductDialog
      open={open}
      onOpenChange={onOpenChange}
      onCreate={(input) => {
        const product = createProduct({
          title: input.title,
          price: input.price,
          cost: input.cost,
          margin: input.price > 0 ? Math.round(((input.price - input.cost) / input.price) * 100) : undefined,
          status: input.status === "active" ? "active" : "draft",
          description: input.description,
          sku: input.sku
        })
        undoable(`${product.title} aangemaakt als ${product.status === "active" ? "actief" : "concept"}`, () =>
          removeProduct(product.id))
      }}
    />
  )
}

/* Stock, SKU, margin and category come from the product itself — its variants, its cost. */
/** "Marges herberekenen" on the demo workspace: the prices taken at once, with one Undo. */
function DemoMargin(props: { open: boolean; onOpenChange: (open: boolean) => void; picked: Row[] }) {
  const editProducts = useWorkspace((s) => s.editProducts)
  const restore = useWorkspace((s) => s.restoreProducts)
  return (
    <MarginDialog
      {...props}
      onApply={(priced, target) => {
        const before = useWorkspace.getState().productEdits
        editProducts(Object.fromEntries(priced.map((r) => [r.product.id, { price: r.price }])))
        undoable(
          `${priced.length} ${priced.length === 1 ? "prijs" : "prijzen"} ingesteld op ${
            Math.round(target * 100)
          }% marge`,
          () => restore(before)
        )
      }}
    />
  )
}

const rowOf = (p: Product, i: number): Row => {
  const supplier = suppliers.find((s) => s.id === p.supplier_id)
  return {
    ...p,
    stock: stockOf(p),
    category: categoryOf(p.title),
    margin: marginOf(p.price, p.cost),
    supplierName: supplier?.name ?? "—",
    avgDelivery: `${
      ((i % 7) + 3 + (i % 3) * 0.3).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    } d`,
    feedback: (3.5 + ((i * 7) % 15) / 10).toLocaleString("nl-NL", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }),
    sku: (p.variants[0]?.sku ?? "").replace(/-[SML]$/, "") || "—"
  }
}

const standing = (rows: ReadonlyArray<Row>) => {
  if (rows.length === 0) return undefined
  const low = rows.filter((p) => p.stock !== "available").length
  const avg = rows.reduce((s, p) => s + p.margin, 0) / rows.length
  // What the stock on hand cost to buy: cost times the units across every variant.
  const value = rows.reduce((s, p) => s + (p.cost ?? 0) * unitsOf(p), 0)
  return `${rows.length} ${rows.length === 1 ? "product" : "producten"} · ${low} moeten worden bijbesteld · ${
    Math.round(
      avg * 100
    )
  }% gemiddelde marge · ${formatCurrency(value)} op de plank`
}

const DemoClosing = ({ empty }: { empty: boolean }) => <ListClosing area="products" empty={empty} />
const ALLOWED = { ok: true, reason: "" }
const NONE: ReadonlyArray<string> = []

export function DemoProductsSource({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { data: products, loading } = useProducts()
  const returnRecords = useReturns((s) => s.records)
  const complaints = useAllComplaints()
  const checks = useQuality((s) => s.checks)
  const orders = useWorkspace((s) => s.orders)
  const starts = useListStarts("products")
  const attention = useMemo(() => {
    const out = new Map<string, { returnHigh: boolean; complaints: number; checkRunning: boolean }>()
    const sold = new Map<string, number>()
    for (const o of orders) {
      for (const l of o.line_items) sold.set(l.product_id, (sold.get(l.product_id) ?? 0) + l.quantity)
    }
    const back = new Map<string, number>()
    for (const r of returnRecords) {
      if (r.status !== "rejected") {
        for (const i of r.items) back.set(i.productId, (back.get(i.productId) ?? 0) + i.qty)
      }
    }
    for (const p of products) {
      const rate = (sold.get(p.id) ?? 0) > 0 ? (back.get(p.id) ?? 0) / (sold.get(p.id) ?? 1) : 0
      out.set(p.id, {
        returnHigh: rate > 0.1,
        complaints: complaints.filter((c) =>
          c.productId === p.id && Date.parse(c.at) > Date.now() - 30 * 86_400_000
        ).length,
        checkRunning: checks.some((c) => c.productId === p.id && (c.status === "requested" || c.status === "submitted"))
      })
    }
    return out
  }, [orders, returnRecords, complaints, checks, products])
  const source: ProductsSource = {
    products,
    loading,
    rowOf,
    standing,
    attentionOf: (p) => attention.get(p.id) ?? { returnHigh: false, complaints: 0, checkRunning: false },
    facets: FACETS,
    hidden: NONE,
    actions: demoProductActions,
    canCreate: ALLOWED,
    NewProduct: DemoNewProduct,
    Margin: DemoMargin,
    LowStock: LowStockPlate,
    categories: true,
    starts,
    Closing: DemoClosing,
    open: (p) => navigate({ to: "/products/$productId", params: { productId: p.id }, state: OPEN_AS_MODAL })
  }
  return <ProductsSourceProvider value={source}>{children}</ProductsSourceProvider>
}
