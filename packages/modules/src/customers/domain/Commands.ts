import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"
import { CustomerRow } from "./Customers.ts"

/*
 * What the customer commands take and answer (M7.4; api.md §2.6). Tags and a new customer reach Shopify after the
 * undo window; a merge is Insyte's (Shopify's own merge needs `write_customer_merge`, not granted yet), with undo.
 */

const Ids = Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(500))
const Tags = Schema.Array(Schema.String.check(Schema.isMaxLength(40))).check(Schema.isMaxLength(20))

export const TagInput = Schema.Struct({ ids: Ids, add: Tags, remove: Tags })

/** The new-customer dialog: a name, and an email or phone so Shopify can tell them apart. */
export const CreateInput = Schema.Struct({
  storeId: Schema.optional(Schema.String),
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  email: Schema.String.check(Schema.isMaxLength(254)),
  phone: Schema.String.check(Schema.isMaxLength(40)),
  /** ISO 3166 alpha-2. */
  country: Schema.String.check(Schema.isMaxLength(2)),
  tags: Tags
})

export const MergeInput = Schema.Struct({
  /** The profile whose name and email stay. */
  survivorId: Schema.String,
  ids: Ids
})

export const NotDuplicateInput = Schema.Struct({ key: Schema.String.check(Schema.isMaxLength(2000)) })

export class CustomerChange extends Schema.Class<CustomerChange>("customers/CustomerChange")({
  customers: Schema.Array(CustomerRow),
  undo: Schema.NullOr(UndoTicket)
}) {}

/** For `Shared.undo`: tags as they were, a new customer removed, or a merge taken apart. */
export const CustomersRestore = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("tags"),
    customers: Schema.Array(Schema.Struct({ id: Schema.String, tags: Schema.Array(Schema.String) }))
  }),
  Schema.Struct({ kind: Schema.Literal("created"), id: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("merged"),
    survivorId: Schema.String,
    absorbed: Schema.Array(Schema.Struct({ id: Schema.String, orderIds: Schema.Array(Schema.String) }))
  })
])
export type CustomersRestore = typeof CustomersRestore.Type

export const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i
