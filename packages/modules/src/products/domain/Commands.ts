import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"
import { ProductRow } from "./Products.ts"

/*
 * What the product commands take and answer (M7.3; api.md §2.5). Amounts in the store's currency, minor units. The
 * page edits one price for the product: it applies to every variant, so a product whose variants are priced apart is
 * priced in Shopify, not here. The cost price is Insyte's own.
 */

const Ids = Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(500))
const Money = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export const ProductStatus = Schema.Literals(["active", "draft", "archived"])

/** The page's draft: only what changed is sent. */
export const EditInput = Schema.Struct({
  id: Schema.String,
  title: Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255))),
  /** Plain text, as the page edits it; Shopify gets it as paragraphs. */
  description: Schema.optional(Schema.String.check(Schema.isMaxLength(20000))),
  status: Schema.optional(ProductStatus),
  priceMinor: Schema.optional(Money),
  /** `null` clears it. */
  costMinor: Schema.optional(Schema.NullOr(Money))
})

export const StatusInput = Schema.Struct({ ids: Ids, status: ProductStatus })

export const RepriceInput = Schema.Struct({
  ids: Ids,
  /** The margin over the cost price each price should keep, 5 to 90 per cent. */
  targetMargin: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0.05), Schema.isLessThanOrEqualTo(0.9)),
  /** False answers the preview only. */
  apply: Schema.Boolean
})

export class ProductChange extends Schema.Class<ProductChange>("products/ProductChange")({
  products: Schema.Array(ProductRow),
  undo: Schema.NullOr(UndoTicket)
}) {}

/** One product's new price at the target margin, or why it keeps its own. */
export const RepriceRow = Schema.Struct({
  id: Schema.String,
  priceMinor: Schema.NullOr(Schema.Int),
  nextMinor: Schema.NullOr(Schema.Int),
  skipped: Schema.NullOr(Schema.Literals(["no_cost", "variants"]))
})

export class RepriceResult extends Schema.Class<RepriceResult>("products/RepriceResult")({
  rows: Schema.Array(RepriceRow),
  undo: Schema.NullOr(UndoTicket)
}) {}

/** The price at a margin over the cost, rounded to the whole unit as the store prices: never below one unit. */
export const priceAt = (costMinor: number, margin: number): number =>
  Math.max(100, Math.round(costMinor / (1 - margin) / 100) * 100)

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }

/** The page's plain text as Shopify's description: paragraphs at blank lines, breaks at single ones. */
export const htmlOf = (text: string): string =>
  text.trim() === ""
    ? ""
    : text.trim().split(/\n{2,}/).map((p) =>
      `<p>${p.replaceAll(/[&<>"]/g, (c) => ESCAPES[c]!).replaceAll("\n", "<br>")}</p>`
    ).join("")

/** The products as they were, for `Shared.undo`: only the fields the command changed are present. */
export const ProductsRestore = Schema.Struct({
  products: Schema.Array(Schema.Struct({
    id: Schema.String,
    title: Schema.optional(Schema.String),
    descriptionHtml: Schema.optional(Schema.String),
    status: Schema.optional(ProductStatus),
    costMinor: Schema.optional(Schema.NullOr(Schema.Int)),
    variantPrices: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String, priceMinor: Schema.Int })))
  }))
})
export type ProductsRestore = typeof ProductsRestore.Type
