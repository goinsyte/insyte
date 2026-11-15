import { statements } from "../statements.ts"

/*
 * The payment method the team chose for a draft made in Insyte (W10.3, widgets/03 "Nieuwe bestelling"). Shopify owns
 * `orders.payment_gateway` (the mirror writes it from the order's transactions), so the dialog's choice is Insyte's
 * own column beside it: written when the draft is made, carried to the real order when Shopify completes the draft,
 * and never touched by the mirror. Shown where Shopify names no gateway.
 *
 * - `draft_payment`: `stripe`, `paypal`, `klarna` or `manual`; null for every order Shopify made.
 */
export default statements(
  `alter table orders add column draft_payment text
     check (draft_payment is null or draft_payment in ('stripe', 'paypal', 'klarna', 'manual'))`
)
