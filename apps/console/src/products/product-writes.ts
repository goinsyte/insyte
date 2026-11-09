import { useAtomSet } from "@effect/atom-react"
import type { ProductChange } from "@insyte/modules/products/domain/Commands"
import type { Product } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { ProductDraft } from "@insyte/ui/app/products/detail-source"
import { Exit } from "effect"
import { toast } from "sonner"
import { PRODUCTS, productWrites } from "../data/products.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The product commands in the console (M7.3): each the server's, refreshing what names `PRODUCTS`, with "Ongedaan
 * maken" spending the command's undo token inside the window, before Shopify hears of it. The cost price is Insyte's
 * own, so a change to it alone is said without Shopify.
 */

const COPY: RefusalCopy = {
  gone: "Dat product bestaat niet meer",
  conflicts: {
    variant_prices: [
      "De varianten hebben elk een eigen prijs",
      "Pas de prijzen per variant aan in Shopify; hier geldt één prijs voor het hele product."
    ],
    disconnected: ["De winkel is niet verbonden", "Verbind de winkel opnieuw om vanuit Shopify te synchroniseren."],
    shopify_unreachable: ["Shopify reageert niet", "Probeer het zo nog eens."],
    shopify_busy: ["Shopify heeft het druk", "Probeer het over een minuut nog eens."]
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

const minor = (units: number) => Math.round(units * 100)

/** Every product command, as the screens call them. */
export function useProductCommands() {
  const keys = { reactivityKeys: PRODUCTS }
  const write = {
    edit: useAtomSet(productWrites.edit, { mode: "promiseExit" }),
    setStatus: useAtomSet(productWrites.setStatus, { mode: "promiseExit" }),
    reprice: useAtomSet(productWrites.reprice, { mode: "promiseExit" }),
    sync: useAtomSet(productWrites.sync, { mode: "promiseExit" }),
    undo: useAtomSet(productWrites.undo, { mode: "promiseExit" })
  }
  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  const said = (exit: Exit.Exit<ProductChange, unknown>, message: string, description?: string) => {
    if (Exit.isFailure(exit)) return refused(failureOf(exit))
    const { undo: ticket, products } = exit.value
    if (products.length === 0 || ticket === null) return
    undoable(message, () => undo(ticket.token), description)
  }

  return {
    /** The page's draft against what is saved: only what changed is sent. */
    save: async (saved: Product, draft: ProductDraft) => {
      const changed = {
        ...(draft.title !== saved.title ? { title: draft.title } : {}),
        ...(draft.description !== saved.description ? { description: draft.description } : {}),
        ...(draft.status !== saved.status ? { status: draft.status } : {}),
        ...(draft.price !== saved.price ? { priceMinor: minor(draft.price) } : {}),
        ...(draft.cost !== saved.cost ? { costMinor: draft.cost === undefined ? null : minor(draft.cost) } : {})
      }
      const shopify = Object.keys(changed).some((k) => k !== "costMinor")
      said(
        await write.edit({ payload: { id: saved.id, ...changed }, ...keys }),
        `${draft.title} opgeslagen`,
        shopify ? "Shopify neemt de nieuwe waarden over bij de volgende synchronisatie." : undefined
      )
    },
    sync: async (product: Product) => {
      const exit = await write.sync({ payload: { id: product.id }, ...keys })
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      toast.success("Product gesynchroniseerd vanuit Shopify", {
        description: "Prijs, voorraad en varianten zijn bijgewerkt."
      })
    },
    setStatus: async (rows: ReadonlyArray<Product>, status: Product["status"], message: string) =>
      said(await write.setStatus({ payload: { ids: rows.map((p) => p.id), status }, ...keys }), message),
    reprice: async (priced: ReadonlyArray<{ product: Product }>, target: number) => {
      const exit = await write.reprice({
        payload: { ids: priced.map((r) => r.product.id), targetMargin: target, apply: true },
        ...keys
      })
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      const { undo: ticket, rows } = exit.value
      const changed = rows.filter((r) => r.nextMinor !== null && r.nextMinor !== r.priceMinor).length
      if (ticket === null || changed === 0) return
      undoable(
        `${changed} ${changed === 1 ? "prijs" : "prijzen"} ingesteld op ${Math.round(target * 100)}% marge`,
        () => undo(ticket.token)
      )
    }
  }
}
