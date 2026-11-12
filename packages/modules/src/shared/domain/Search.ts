import { Schema } from "effect"

/*
 * One search for every picker (api.md `Search.records`): the command palette, the bookmark picker, Ask's `@` popover.
 * Each slice answers for its own kinds; the handler merges them. A hit names the record, not its contents, except a
 * chat message, whose words around the match are what it is found by.
 */

export const SearchKind = Schema.Literals(["order", "product", "customer", "ticket", "thread", "message"])
export type SearchKind = typeof SearchKind.Type

export class SearchHit extends Schema.Class<SearchHit>("shared/SearchHit")({
  kind: SearchKind,
  id: Schema.String,
  title: Schema.String,
  subtitle: Schema.NullOr(Schema.String),
  /** The console path that opens it. */
  href: Schema.String
}) {}

const escaped = (q: string) => q.trim().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")

/** The text as a pattern for `ilike`, its wildcards escaped. */
export const likePattern = (q: string) => `%${escaped(q)}%`

/** The text as the start of a value, for ranking a match that begins with it above one that contains it. */
export const prefixPattern = (q: string) => `${escaped(q)}%`

/** Up to `max` characters of `text` around the first place `q` is in it, on one line, cut at words where it can. */
export const excerptOf = (text: string, q: string, max = 120) => {
  const flat = text.replaceAll(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  const at = Math.max(0, flat.toLowerCase().indexOf(q.trim().toLowerCase()))
  const start = Math.max(0, Math.min(at - Math.floor(max / 3), flat.length - max))
  // Start after a space when there is one before the match, so the excerpt does not open mid-word.
  const space = start === 0 ? -1 : flat.indexOf(" ", start)
  const cut = space !== -1 && space < at ? space + 1 : start
  const end = Math.min(flat.length, cut + max)
  return `${cut > 0 ? "…" : ""}${flat.slice(cut, end).trim()}${end < flat.length ? "…" : ""}`
}
