import { Schema } from "effect"

/* How the public API answers a list (M19.2): every row at once, or a page with its cursor and total. */

export const List = <S extends Schema.Top>(item: S) => Schema.Struct({ data: Schema.Array(item) })

/** A page: the rows, the cursor for the next (`null` at the end), and how many match in all. */
export const Page = <S extends Schema.Top>(item: S) =>
  Schema.Struct({ data: Schema.Array(item), next_cursor: Schema.NullOr(Schema.String), total: Schema.Int })

/** What every list reads from its query string. */
export const ListQuery = Schema.Struct({
  limit: Schema.optional(Schema.FiniteFromString),
  cursor: Schema.optional(Schema.String),
  q: Schema.optional(Schema.String),
  store_id: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String)
})
export type ListQuery = typeof ListQuery.Type
