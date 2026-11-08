import { Schema } from "effect"

/** Every store, or these. A member's stores narrow their role's, never widen them (06 §3.2). */
export const StoreAccess = Schema.Union([Schema.Literal("all"), Schema.Array(Schema.String)])
export type StoreAccess = typeof StoreAccess.Type
