import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"
import { OrderRow } from "./Orders.ts"

/*
 * What the order commands take and answer (M7.1; api.md §2.4). Bulk commands take up to 500 ids and change them in
 * one transaction with one undo token. Tags are the operator's own: Insyte's markers (`SYSTEM_TAGS`) change only
 * through the command that sets them, so a tag command naming one is refused.
 */

/** Insyte's own markers on an order, as the console's `lib/order-tags.ts` names them. */
export const SYSTEM_TAGS: ReadonlySet<string> = new Set(["at_risk", "tracking_sent", "draft"])

/**
 * A tag the operator adds, as it is stored: lower case, words joined by hyphens, as the console's `normaliseTag`.
 * Tags taken off are named as they are, Shopify's own spelling included.
 */
export const normaliseTag = (raw: string): string => raw.trim().toLowerCase().replace(/\s+/g, "-")

const Ids = Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(500))
const Tags = Schema.Array(Schema.String.check(Schema.isMaxLength(40))).check(Schema.isMaxLength(20))

export const TagInput = Schema.Struct({ ids: Ids, add: Tags, remove: Tags })
export const IdsInput = Schema.Struct({ ids: Ids })

export const NoteInput = Schema.Struct({
  id: Schema.String,
  /** Empty clears the note. */
  body: Schema.String.check(Schema.isMaxLength(5000))
})

/** The address as the shipping dialog edits it; the name and phone on the order stay as they are. */
export const ShippingInput = Schema.Struct({
  id: Schema.String,
  address: Schema.Struct({
    line1: Schema.String.check(Schema.isMaxLength(200)),
    line2: Schema.NullOr(Schema.String.check(Schema.isMaxLength(200))),
    city: Schema.String.check(Schema.isMaxLength(100)),
    postcode: Schema.String.check(Schema.isMaxLength(20)),
    region: Schema.String.check(Schema.isMaxLength(100)),
    /** ISO 3166 alpha-2, as Shopify's `countryCode`; anything else is `Invalid`. */
    country: Schema.String.check(Schema.isMaxLength(60))
  })
})

export const CancelInput = Schema.Struct({
  ids: Ids,
  /** Put the committed stock back (Shopify's `restock`). */
  restock: Schema.Boolean,
  /** Let the customer know (Shopify's `notifyCustomer`). */
  notify: Schema.Boolean
})

/** How the shopper will pay a draft order, as the dialog asks it; kept on the draft (Shopify asks at checkout). */
export const DraftPayment = Schema.Literals(["stripe", "paypal", "klarna", "manual"])

/** One line of a draft: a variant of the store where its SKU is one, else a line of its own. */
export const DraftLine = Schema.Struct({
  sku: Schema.String.check(Schema.isMaxLength(100)),
  title: Schema.String.check(Schema.isMaxLength(255)),
  quantity: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(999)),
  /** In the store's currency; 0 takes the variant's own price. */
  unitPriceMinor: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
})

/** "Nieuwe bestelling": a draft order in one of the principal's stores (widgets/03 "Nieuwe bestelling"). */
export const CreateDraftInput = Schema.Struct({
  storeId: Schema.String,
  customer: Schema.Struct({
    name: Schema.String.check(Schema.isMaxLength(120)),
    email: Schema.String.check(Schema.isMaxLength(254))
  }),
  payment: DraftPayment,
  lines: Schema.Array(DraftLine).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  /** The team's internal note (`order_notes`): never sent to Shopify. */
  note: Schema.String.check(Schema.isMaxLength(2000))
})

/** What a command changed, and where it can be taken back, its undo (none for a cancellation). */
export class OrderChange extends Schema.Class<OrderChange>("orders/OrderChange")({
  orders: Schema.Array(OrderRow),
  undo: Schema.NullOr(UndoTicket)
}) {}

/** The operator's tags in the role's stores, the most used first: TagDialog's and the inline suggestions. */
export const TagCount = Schema.Struct({ tag: Schema.String, count: Schema.Int })

/**
 * The orders as they were, field by field, for `Shared.undo`: only the fields the command changed are present. `mails`:
 * the shopper mails the command put in line (`order_mails`), called off before they leave.
 */
export const OrdersRestore = Schema.Struct({
  orders: Schema.Array(Schema.Struct({
    id: Schema.String,
    tags: Schema.optional(Schema.Array(Schema.String)),
    shippingAddress: Schema.optional(Schema.Unknown),
    status: Schema.optional(Schema.String),
    fulfillmentStatus: Schema.optional(Schema.String),
    shippedAt: Schema.optional(Schema.NullOr(Schema.String)),
    /** `Orders.flagDelayed` / `clearDelay`: when it was delayed, or null for not. */
    delayedAt: Schema.optional(Schema.NullOr(Schema.String))
  })),
  mails: Schema.optional(Schema.Array(Schema.String)),
  /** `Orders.createDraft`: the draft made, removed again before Shopify heard of it. */
  draft: Schema.optional(Schema.String)
})
export type OrdersRestore = typeof OrdersRestore.Type
