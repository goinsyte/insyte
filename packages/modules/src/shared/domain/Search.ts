import { Schema } from "effect"

/*
 * One search for every picker (api.md `Search.records`): the command palette, the bookmark picker, Ask's `@` popover.
 * Each slice answers for its own kinds; the handler merges them. A hit names the record, not its contents.
 */

export const SearchKind = Schema.Literals(["order", "product", "customer"])
export type SearchKind = typeof SearchKind.Type

export class SearchHit extends Schema.Class<SearchHit>("shared/SearchHit")({
  kind: SearchKind,
  id: Schema.String,
  title: Schema.String,
  subtitle: Schema.NullOr(Schema.String),
  /** The console path that opens it. */
  href: Schema.String
}) {}

/** The text as a pattern for `ilike`, its wildcards escaped. */
export const likePattern = (q: string) =>
  `%${q.trim().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
