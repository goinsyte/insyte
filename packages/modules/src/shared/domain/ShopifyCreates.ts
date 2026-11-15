/*
 * What Shopify's refusal to make a record comes down to (M7: a draft order, a product), for the person who made it in
 * Insyte: Shopify answers `userErrors` with a field path and an English message, and the console says it in Dutch by
 * the reason (`CREATE_REFUSED` in the notification words). A scope the store has not granted yet is its own reason.
 */

export type CreateRefusal = "email" | "lines" | "title" | "sku" | "price" | "scope" | "other"

type UserError = { readonly field?: ReadonlyArray<string> | null; readonly message: string }

/** The first error's reason, by the field it names, else by what its message says. */
export const refusalOf = (errors: ReadonlyArray<UserError>): CreateRefusal => {
  for (const error of errors) {
    const path = (error.field ?? []).map((f) => f.toLowerCase())
    const message = error.message.toLowerCase()
    if (path.includes("email") || message.includes("email")) return "email"
    if (path.includes("sku") || message.includes("sku")) return "sku"
    if (path.some((f) => f.includes("price")) || message.includes("price")) return "price"
    if (path.includes("lineitems") || message.includes("line item")) return "lines"
    if (path.includes("title") || path.includes("handle") || message.includes("title")) return "title"
  }
  return "other"
}

/** The refusal in the console's words: what Shopify would not take, said once. */
export const CREATE_REFUSED: Readonly<Record<CreateRefusal, string>> = {
  email: "Shopify accepteert het e-mailadres van de klant niet.",
  lines: "Shopify accepteert een van de artikelen niet.",
  title: "Shopify accepteert deze titel niet.",
  sku: "Shopify accepteert deze SKU niet.",
  price: "Shopify accepteert deze prijs niet.",
  scope: "Insyte mag dit nog niet in deze winkel. Open de app in Shopify en keur de nieuwe toestemmingen goed.",
  other: "Shopify gaf geen reden op."
}
