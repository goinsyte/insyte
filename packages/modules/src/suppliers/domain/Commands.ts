import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"
import { ForwardChannel, StockMode, SupplierRow } from "./Suppliers.ts"

/*
 * What the supplier commands take and answer (M8.1; api.md §2.7). They are Insyte's own records: nothing reaches
 * Shopify, and each change comes with one undo token.
 */

const Ids = Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(500))
const Name = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120))
const Email = Schema.String.check(Schema.isMaxLength(254))
const Phone = Schema.String.check(Schema.isMaxLength(40))
const Description = Schema.String.check(Schema.isMaxLength(500))
const LeadDays = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(30))

/** "Nieuwe leverancier": a name, and how to reach them. */
export const CreateInput = Schema.Struct({
  name: Name,
  contactEmail: Email,
  contactPhone: Phone,
  description: Description,
  defaultLeadDays: Schema.optional(LeadDays)
})

/** The supplier dialog and "Bewerken": only what is given changes. */
export const UpdateInput = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Name),
  contactEmail: Schema.optional(Email),
  contactPhone: Schema.optional(Phone),
  description: Schema.optional(Description),
  defaultLeadDays: Schema.optional(LeadDays),
  autoForward: Schema.optional(Schema.Boolean),
  forwardChannel: Schema.optional(ForwardChannel),
  forwardEmail: Schema.optional(Email),
  confirmWithinHours: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(168))
  ),
  stockMode: Schema.optional(StockMode)
})

/** Pausing or resuming new orders for many at once: a mixed selection is not flipped both ways. */
export const SetPausedInput = Schema.Struct({ ids: Ids, paused: Schema.Boolean })

/** Makes the supplier the primary one of these products: every line of them is theirs from now on. */
export const AssignInput = Schema.Struct({ supplierId: Schema.String, productIds: Ids })

export class SupplierChange extends Schema.Class<SupplierChange>("suppliers/SupplierChange")({
  suppliers: Schema.Array(SupplierRow),
  undo: Schema.NullOr(UndoTicket)
}) {}

/** The fields an update can change, as they were (for `Shared.undo`). */
const Fields = Schema.Struct({
  name: Schema.optional(Schema.String),
  contactEmail: Schema.optional(Schema.NullOr(Schema.String)),
  contactPhone: Schema.optional(Schema.NullOr(Schema.String)),
  description: Schema.optional(Schema.String),
  defaultLeadDays: Schema.optional(Schema.Int),
  autoForward: Schema.optional(Schema.Boolean),
  forwardChannel: Schema.optional(ForwardChannel),
  forwardEmail: Schema.optional(Schema.NullOr(Schema.String)),
  confirmWithinHours: Schema.optional(Schema.Int),
  stockMode: Schema.optional(StockMode)
})
export type Fields = typeof Fields.Type

const Supply = Schema.Struct({ productId: Schema.String, isPrimary: Schema.Boolean, leadDays: Schema.Int })

/** For `Shared.undo`: fields as they were, a new supplier taken away, pauses as they were, products given back. */
export const SuppliersRestore = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("fields"), id: Schema.String, fields: Fields }),
  Schema.Struct({ kind: Schema.Literal("created"), id: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("paused"),
    suppliers: Schema.Array(Schema.Struct({ id: Schema.String, pausedAt: Schema.NullOr(Schema.Finite) }))
  }),
  Schema.Struct({
    kind: Schema.Literal("assigned"),
    supplierId: Schema.String,
    /** Each product's primary supplier before, `null` where it had none. */
    products: Schema.Array(Schema.Struct({ productId: Schema.String, was: Schema.NullOr(Schema.String) }))
  }),
  Schema.Struct({ kind: Schema.Literal("removed"), id: Schema.String, supply: Schema.Array(Supply) })
])
export type SuppliersRestore = typeof SuppliersRestore.Type
