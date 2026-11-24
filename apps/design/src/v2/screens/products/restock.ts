import { getProductState, setProductState } from "../../fixtures/products.ts"
import type { ProductRow, ProductState } from "../../fixtures/products.ts"
import { toast } from "../../ui/toast.tsx"
import { dropTickets } from "../inbox/store.ts"
import { fileSupplierTickets } from "../suppliers/tickets.ts"

/*
 * Bijbestellen (`/app`'s products demo-source): one ticket per product to its supplier, asking for a
 * date and the number that covers four weeks at last week's pace. The product remembers its ticket,
 * so the list and the supplier say it was asked, and Undo takes the tickets and the mark back.
 */

/** Four weeks at last week's pace, less what is on the shelf; never below a dozen. */
const quantity = (r: ProductRow) => Math.max(12, Math.ceil((r.sold / 7) * 28) - r.stock)

/**
 * `with` is a change made in the same move (the low-stock proposal pauses the ads too), so one Undo
 * takes both back; `title` says that move in the toast.
 */
export function askRestock(
  rows: ReadonlyArray<ProductRow>,
  { with: extra, title }: { readonly with?: (s: ProductState) => ProductState; readonly title?: string } = {}
) {
  const s = getProductState()
  const todo = rows.filter((r) => s.restock[r.id] === undefined)
  const skipped = rows.length - todo.length
  if (todo.length === 0 && extra === undefined) {
    toast({ title: "Al gevraagd", body: "Daar staat al een ticket voor open." })
    return
  }
  const before = s
  const numbers = fileSupplierTickets(
    todo.map((r) => ({
      supplierId: r.supplierId,
      subject: `${r.name} bijbestellen bij ${r.supplierName}`,
      note: `Vraag ${r.supplierName} om ongeveer ${quantity(r)} stuks van ${r.name} (${r.sku}) en een leverdatum. ` +
        `Er liggen er ${r.stock}; vorige week gingen er ${r.sold} weg.`,
      priority: r.level === "op" ? "hoog" : "gemiddeld",
      also: { kind: "product", id: r.id, label: r.name }
    })),
    { quiet: true }
  )
  setProductState((cur) => {
    const st = extra === undefined ? cur : extra(cur)
    return {
      ...st,
      restock: { ...st.restock, ...Object.fromEntries(todo.map((r, i) => [r.id, numbers[i] ?? ""])) }
    }
  })
  const first = numbers[0]
  const suppliers = new Set(todo.map((r) => r.supplierName))
  const ticket = numbers.length === 1 && title !== undefined ? ` Ticket #${first ?? ""}.` : ""
  toast({
    title: title ??
      (numbers.length === 1
        ? `Bijbestelling gevraagd: ticket #${first ?? ""}`
        : `${numbers.length} bijbestellingen gevraagd`),
    body: todo.length === 0 ?
      "De bijbestelling stond al open." :
      `${
        suppliers.size === 1 ? `Aan ${[...suppliers][0] ?? ""}` : `Aan ${suppliers.size} leveranciers`
      }, als ticket op het bord.${ticket}${
        skipped === 0 ? "" : ` ${skipped} stond${skipped === 1 ? "" : "en"} al open.`
      }`,
    tone: "good",
    duration: 30_000,
    action: {
      label: "Ongedaan maken",
      onClick: () => {
        dropTickets(numbers)
        setProductState(() => before)
        toast({ title: "Teruggezet" })
      }
    }
  })
}
