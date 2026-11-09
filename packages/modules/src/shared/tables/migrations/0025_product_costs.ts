import { statements } from "../statements.ts"

/**
 * A product's cost price (M7.3): Insyte's own figure, never sent to Shopify, for the margin column and "Marges
 * herberekenen". One per product, in the store's currency; the mirror never writes it, so an import leaves it as it is.
 */
export default statements(
  "alter table products add column cost_minor bigint check (cost_minor >= 0)"
)
