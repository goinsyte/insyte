import { Schema } from "effect"

/*
 * A return in Shopify (M9.3; Admin GraphQL 2026-10, widgets/03 "Returns"): what a resolution makes there once its undo
 * window has passed (a gift card, a single-use discount code for the shopper, a draft order completed into the exchange
 * or replacement), a Shopify return approved or declined from Insyte, and Shopify's own returns as its `returns/*`
 * webhooks describe them. Each mutation answers its `userErrors`: a refusal is Shopify's word on the return, not a
 * failure to retry.
 */

/** The gift card under Insyte's own code, so a step tried again finds the code taken instead of making a second card. */
export const GIFT_CARD_CREATE = `mutation($input: GiftCardCreateInput!) {
  giftCardCreate(input: $input) { giftCard { id maskedCode } giftCardCode userErrors { field message code } }
}`

export const DISCOUNT_CODE_CREATE = `mutation($basicCodeDiscount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
    codeDiscountNode { id }
    userErrors { field message code }
  }
}`

export const DRAFT_ORDER_CREATE = `mutation($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) { draftOrder { id } userErrors { field message } }
}`

/** Completed paid (nothing to pay), or with the exchange fee still to pay (`paymentPending`). */
export const DRAFT_ORDER_COMPLETE = `mutation($id: ID!, $paymentPending: Boolean) {
  draftOrderComplete(id: $id, paymentPending: $paymentPending) {
    draftOrder { id order { id name } }
    userErrors { field message }
  }
}`

/** Insyte writes the shopper's mail, so Shopify does not (`notifyCustomer: false`). */
export const RETURN_APPROVE = `mutation($input: ReturnApproveRequestInput!) {
  returnApproveRequest(input: $input) { return { id status } userErrors { field message code } }
}`

export const RETURN_DECLINE = `mutation($input: ReturnDeclineRequestInput!) {
  returnDeclineRequest(input: $input) { return { id status } userErrors { field message code } }
}`

/** Shopify's user error for a code that exists: one Insyte made on an earlier try of the same step. */
export const isTaken = (errors: ReadonlyArray<{ readonly code?: string | null }>) =>
  errors.length > 0 && errors.every((e) => e.code === "TAKEN")

/** Letters and digits that cannot be misread (no 0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

const random = (n: number) =>
  [...crypto.getRandomValues(new Uint8Array(n))].map((b) => ALPHABET[b % ALPHABET.length]).join("")

/** A gift card's code: 16 letters and digits (Shopify takes 8 to 20). */
export const giftCardCode = () => random(16)

/** A discount code that names its return: `R1042-7KQ2XM`. */
export const discountCode = (number: string) => `${number.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}-${random(6)}`

/**
 * `returns.resolution_shopify` (M9.3): what a resolution made in Shopify. Asked for (`requested`, waiting out its undo
 * window or asked again), made (`done`: the gift card, the discount, or the draft and the order it became) or failed
 * with why; a scope the store has not granted is named, so the console can say what to do. The code is Insyte's, made
 * when the return was settled.
 */
export const StoredResolution = Schema.Struct({
  state: Schema.Literals(["requested", "done", "failed"]),
  /** In minor units, the return's currency: the gift card's value, the code's discount. */
  amountMinor: Schema.optional(Schema.Int),
  code: Schema.optional(Schema.String),
  shopifyId: Schema.optional(Schema.String),
  draftId: Schema.optional(Schema.String),
  /** The order the draft became, by its Shopify id and name. */
  orderId: Schema.optional(Schema.String),
  orderName: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String)
})
export type StoredResolution = typeof StoredResolution.Type

/** A Shopify id from a webhook's number or a GraphQL gid. */
const idOf = (value: unknown): string | null =>
  typeof value === "number"
    ? String(value)
    : typeof value === "string" && value !== ""
    ? value.slice(value.lastIndexOf("/") + 1)
    : null

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}

const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null)

/** A return as a `returns/*` webhook carries it: Shopify's ids, its lines with their reason, why it was declined. */
export interface ShopifyReturnPayload {
  readonly id: string
  readonly orderId: string | null
  readonly lines: ReadonlyArray<{
    readonly lineItemId: string
    readonly quantity: number
    readonly reason: string | null
    readonly note: string | null
  }>
  readonly declineNote: string | null
}

/** The payload of `returns/request|approve|decline|close`, as Shopify sends it (REST's underscored keys). */
export const returnPayload = (body: Record<string, unknown>): ShopifyReturnPayload | undefined => {
  const id = idOf(body["id"]) ?? idOf(body["admin_graphql_api_id"])
  if (id === null) return undefined
  const order = record(body["order"])
  const lines = Array.isArray(body["return_line_items"]) ? body["return_line_items"] : []
  return {
    id,
    orderId: idOf(order["id"]) ?? idOf(order["admin_graphql_api_id"]) ?? idOf(body["order_id"]),
    lines: lines.flatMap((raw) => {
      const l = record(raw)
      const fulfilled = record(l["fulfillment_line_item"])
      const lineItemId = idOf(record(fulfilled["line_item"])["id"]) ?? idOf(record(l["line_item"])["id"]) ??
        idOf(l["line_item_id"])
      if (lineItemId === null) return []
      const quantity = Number(l["quantity"] ?? 1)
      return [{
        lineItemId,
        quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
        reason: text(l["return_reason"])?.toLowerCase() ?? null,
        note: text(l["customer_note"]) ?? text(l["return_reason_note"])
      }]
    }),
    declineNote: text(record(body["decline"])["note"])
  }
}

/** Shopify's return reasons in Insyte's default reasons; anything else reads as not what was expected. */
const REASONS: Readonly<Record<string, string>> = {
  size_too_small: "too_small",
  size_too_large: "too_big",
  defective: "damaged",
  wrong_item: "wrong_item",
  not_as_described: "not_as_expected",
  unwanted: "not_as_expected",
  style: "not_as_expected",
  color: "not_as_expected"
}

export const reasonFor = (shopify: string | null) => REASONS[shopify ?? ""] ?? "not_as_expected"
