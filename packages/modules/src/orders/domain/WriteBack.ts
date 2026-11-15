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

/** A draft order made in Insyte ("Nieuwe bestelling"): Shopify's draft, with its own number (`#D1`) beside Insyte's. */
export const DRAFT_CREATE = `mutation($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) { draftOrder { id name } userErrors { field message } }
}`

/**
 * Shopify's drafts for an Insyte draft, by the tag its create carried (its `SO-…` number): a create tried again after
 * Shopify made it, but before Insyte heard so, finds it here instead of making a second. Shopify's search lags behind
 * its writes, so one made a moment ago may not be found yet: every one found is read, with its status, so a later look
 * can delete the twins a lagging search let through, and one of a record Insyte no longer holds.
 */
export const DRAFT_FIND = `query($query: String!) {
  draftOrders(first: 25, query: $query) { nodes { id status createdAt } }
}`

/** A draft Shopify found by its tag: a completed one is an order now, never deleted. */
export interface DraftFound {
  readonly id: string
  readonly status: string
  readonly createdAt?: string
}

/** The open drafts in a `DRAFT_FIND` answer. */
export const openDrafts = (data: unknown): ReadonlyArray<DraftFound> =>
  ((data as { draftOrders?: { nodes?: ReadonlyArray<DraftFound> } } | null)?.draftOrders?.nodes ?? [])
    .filter((d) => d.status !== "COMPLETED")

/** The tag search for a draft's number, as Shopify's search reads it. */
export const draftTagQuery = (number: string) => `tag:'${number.replaceAll("'", "")}'`

export const DRAFT_DELETE = `mutation($input: DraftOrderDeleteInput!) {
  draftOrderDelete(input: $input) { deletedId userErrors { field message } }
}`

/** A draft as Insyte keeps it until Shopify has one (`insyte-<id>`), then Shopify's draft (`draft-<number>`). */
export const DRAFT_PREFIX = "draft-"
