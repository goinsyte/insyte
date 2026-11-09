import type { OutboxEvent } from "../../shared/domain/Outbox.ts"

/*
 * What Shopify is asked when an order changed in Insyte (M7.1; Admin GraphQL 2026-10). Each mutation answers its
 * `userErrors` (`orderCancelUserErrors` for a cancellation): a refusal is Shopify's word on the order, not a failure to
 * retry.
 */

export const TAGS_ADD = `mutation($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
}`

export const TAGS_REMOVE = `mutation($id: ID!, $tags: [String!]!) {
  tagsRemove(id: $id, tags: $tags) { userErrors { field message } }
}`

export const ORDER_UPDATE = `mutation($input: OrderInput!) {
  orderUpdate(input: $input) { order { id } userErrors { field message } }
}`

/** The order's fulfillment orders and their lines, to fulfil those still open (all, or one supplier's lines). */
export const FULFILLMENT_ORDERS = `query($id: ID!) {
  order(id: $id) {
    fulfillmentOrders(first: 20) {
      nodes { id status lineItems(first: 50) { nodes { id remainingQuantity lineItem { id } } } }
    }
  }
}`

export const FULFILLMENT_CREATE = `mutation($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id status } userErrors { field message } }
}`

/** Without a refund: money leaving is `Orders.refund`'s, with its own limit (M7.2). */
export const ORDER_CANCEL = `mutation($orderId: ID!, $restock: Boolean!, $notify: Boolean) {
  orderCancel(orderId: $orderId, reason: OTHER, restock: $restock, notifyCustomer: $notify,
              staffNote: "Geannuleerd in Insyte") {
    job { id }
    orderCancelUserErrors { field message code }
  }
}`

/** Where the money goes back: Shopify's own split over the order's payments, for its whole balance. */
export const SUGGESTED_REFUND = `query($id: ID!) {
  order(id: $id) {
    suggestedRefund(suggestFullRefund: true, refundShipping: true) {
      suggestedTransactions { parentTransaction { id } gateway amountSet { shopMoney { amount } } }
    }
  }
}`

/** Idempotent on Insyte's refund id: asked again after a lost answer, Shopify answers the same refund. */
export const REFUND_CREATE = `mutation($input: RefundInput!, $key: String!) {
  refundCreate(input: $input) @idempotent(key: $key) { refund { id } userErrors { field message } }
}`

/** Fulfillment orders Shopify lets a merchant fulfil. */
export const FULFILLABLE: ReadonlySet<string> = new Set(["OPEN", "IN_PROGRESS"])

/** An order change on its way to Shopify: the outbox event as the relay delivered it. */
export type OrderWrite =
  | Extract<OutboxEvent, { type: "order.updated" }>
  | Extract<OutboxEvent, { type: "order.cancelled" }>
  | Extract<OutboxEvent, { type: "refund.requested" }>
