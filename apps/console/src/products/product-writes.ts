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
 * own, so a change to it alone is said without Shopify. "Nieuw product" makes one the same way (M7.3).
 */

const COPY: RefusalCopy = {
  gone: "Dat product bestaat niet meer",
  conflicts: {
    variant_prices: [
      "De varianten hebben elk een eigen prijs",
      "Pas de prijzen per variant aan in Shopify; hier geldt één prijs voor het hele product."
    ],
    disconnected: ["De winkel is niet verbonden", "Verbind de winkel opnieuw om vanuit Shopify te synchroniseren."],
    no_store: ["Nog geen winkel", "Verbind eerst een winkel; daar komt het product in."],
    shopify_unreachable: ["Shopify reageert niet", "Probeer het zo nog eens."],
    shopify_busy: ["Shopify heeft het druk", "Probeer het over een minuut nog eens."]
  },
  invalid: {
    title: "Geef het product een titel.",
    priceMinor: "Geef het product een prijs boven nul.",
    sku: "Deze SKU heeft al een product in deze winkel.",
    supplierId: "Die leverancier bestaat niet meer. Kies een andere."
  },
  other: (tagged) => {
    if (tagged._tag !== "NotFound" || tagged["entity"] !== "store") return false
    toast.error("Die winkel kun je niet bereiken", { description: "Kies een winkel waar je rol bij kan." })
    return true
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

const minor = (units: number) => Math.round(units * 100)

/** "Nieuw product" as the dialog fills it in: amounts in the store's units, no supplier as `null`. */
export interface NewProduct {
  readonly storeId: string | undefined
  readonly title: string
  readonly sku: string
  readonly price: number
  readonly cost: number
  readonly supplierId: string | null
  readonly status: "active" | "draft" | "archived"
  readonly description: string
}

/** Every product command, as the screens call them. */
export function useProductCommands() {
  const keys = { reactivityKeys: PRODUCTS }
  const write = {
    edit: useAtomSet(productWrites.edit, { mode: "promiseExit" }),
    setStatus: useAtomSet(productWrites.setStatus, { mode: "promiseExit" }),
    reprice: useAtomSet(productWrites.reprice, { mode: "promiseExit" }),
    sync: useAtomSet(productWrites.sync, { mode: "promiseExit" }),
    create: useAtomSet(productWrites.create, { mode: "promiseExit" }),
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
    /**
     * "Nieuw product": in Insyte at once, in Shopify once the undo window has passed. A cost price of 0 is none; an
     * archived product is not made, so the dialog offers active or concept only. Answers the product's id, to open it.
     */
    create: async (input: NewProduct): Promise<string | undefined> => {
      const exit = await write.create({
        payload: {
          ...(input.storeId === undefined ? {} : { storeId: input.storeId }),
          title: input.title,
          sku: input.sku,
          priceMinor: minor(input.price),
          costMinor: input.cost > 0 ? minor(input.cost) : null,
          supplierId: input.supplierId,
          status: input.status === "active" ? "active" : "draft",
          description: input.description
        },
        ...keys
      })
      said(
        exit,
        `${input.title.trim()} aangemaakt`,
        "Shopify krijgt het product zodra je het niet meer ongedaan kunt maken."
      )
      return Exit.isSuccess(exit) ? exit.value.products[0]?.id : undefined
    },
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
