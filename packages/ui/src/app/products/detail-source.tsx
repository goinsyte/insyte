import { type ComponentType, createContext, useContext } from "react"
import type { Attachment } from "../chats/attachments"
import type { Stock } from "../lib/catalog"
import type { Currency, Product, Supplier, Variant } from "../lib/types/domain"

/**
 * What one product's page reads and does, from whoever hosts it (as `source.tsx` is for the list): the design app from
 * its demo workspace, the console from `Products.get` (M6.4). The page's markup is the design's. Without `edit` every
 * field reads as its value and nothing is saved (a role without Producten · Bewerken); without `stock` the stock lines
 * are left out (until inventory per location is mirrored); without `quality` there are no tabs. Without suppliers
 * (the console until M8) there is no Leverancier line.
 */

/** What the page edits, held as a draft until the bar at its foot saves it. */
export type ProductDraft = Pick<Product, "title" | "description" | "price" | "status" | "supplier_id"> & {
  cost: number | undefined
}

export interface ProductEdit {
  save: (draft: ProductDraft) => void
  /** "Synchroniseren vanuit Shopify". */
  sync: () => Promise<void>
  suppliers: ReadonlyArray<Supplier>
  /** The supplier's own delivery time for this product, where it gave one. */
  leadDays?: number | undefined
  /** Files the supplier sent for it. */
  media: ReadonlyArray<Attachment>
  /** Ads paused until it is back in stock, and the way to resume them. */
  adsPaused: boolean
  resumeAds: () => void
}

export interface ProductDetailSource {
  product: Product
  /** The currency its prices are in; absent, the format's own. */
  currency?: Currency | undefined
  /** Its category, from the title as it is being edited. */
  categoryOf: (title: string) => string
  /** Units over every variant, how long they last at the current pace, and the level. */
  stock?: { units: number; daysLeft: number | null; level: Stock } | undefined
  /** A variant's units, where the host knows them. */
  variantStock: (variant: Variant) => number | undefined
  /** The product in Shopify's admin. */
  shopifyUrl: string
  edit?: ProductEdit | undefined
  quality?:
    | {
      tab: "overview" | "quality"
      setTab: (tab: "overview" | "quality") => void
      /** Checks waiting on a decision, and whether the product is being watched. */
      submitted: number
      watching: boolean
      Tab: ComponentType<{ product: Product }>
    }
    | undefined
  Returns?: ComponentType<{ productId: string }> | undefined
  /** True while the host is still reading the product; absent where it arrives at the reference's pace. */
  arriving?: boolean | undefined
}

const ProductDetailSourceContext = createContext<ProductDetailSource | null>(null)

export const ProductDetailSourceProvider = ProductDetailSourceContext.Provider

export function useProductDetailSource(): ProductDetailSource {
  const source = useContext(ProductDetailSourceContext)
  if (source === null) throw new Error("A product's page needs a ProductDetailSourceProvider around it.")
  return source
}
