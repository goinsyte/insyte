import { Schema } from "effect"

/*
 * A list's filter as the console builds it (`lib/filter.ts` in the design; widgets/01 "The list table"): rules joined
 * by And or Or, and groups of rules inside that. The server compiles it against the list's whitelist of fields
 * (`tables/FilterSql.ts`) and refuses a field it does not know, never interpolating one. A rule with nothing filled in
 * matches everything, as in the console.
 */

export const FilterOp = Schema.Literals([
  "any",
  "none",
  "contains",
  "not_contains",
  "is",
  "gt",
  "lt",
  "last_days",
  "before",
  "after",
  "empty",
  "not_empty"
])
export type FilterOp = typeof FilterOp.Type

export const FilterRule = Schema.Struct({
  kind: Schema.Literal("rule"),
  id: Schema.String,
  field: Schema.String,
  op: FilterOp,
  value: Schema.Union([Schema.String, Schema.Array(Schema.String)])
})
export type FilterRule = typeof FilterRule.Type

export interface FilterGroup {
  readonly kind: "group"
  readonly id: string
  readonly join: "and" | "or"
  readonly children: ReadonlyArray<FilterRule | FilterGroup>
}

export const FilterGroup: Schema.Codec<FilterGroup> = Schema.Struct({
  kind: Schema.Literal("group"),
  id: Schema.String,
  join: Schema.Literals(["and", "or"]),
  children: Schema.Array(Schema.Union([FilterRule, Schema.suspend((): Schema.Codec<FilterGroup> => FilterGroup)]))
})

export const FilterNode = Schema.Union([FilterRule, FilterGroup])
export type FilterNode = typeof FilterNode.Type

/** A rule names a field the list does not filter on. */
export class FilterFieldUnknown extends Schema.TaggedError<FilterFieldUnknown>()("FilterFieldUnknown", {
  field: Schema.String
}) {}

/** A cursor that is not one this list handed out. */
export class CursorInvalid extends Schema.TaggedError<CursorInvalid>()("CursorInvalid", {}) {}

/** What every list takes (widgets/01): a filter, a search, a page after a cursor, a page size. */
export const ListInput = Schema.Struct({
  filter: Schema.optional(FilterNode),
  q: Schema.optional(Schema.String),
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))),
  storeId: Schema.optional(Schema.String)
})
export type ListInput = typeof ListInput.Type
