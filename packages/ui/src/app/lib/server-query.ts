import { type FilterNode, type Group, isComplete, type Rule } from "./filter.ts"

/*
 * A table that pages on the server (`table/data-table.tsx`, `server`) asks for its rows in its own words: the filter on
 * its column ids, with the values its facets show, and the order by a column id. The host turns that into the list's
 * input over the server's whitelist (`FilterSql.ts` in the modules), field by field: a column the server filters under
 * another name, a value it keeps differently ("ja" as "yes"), a value that stands for nothing ("—" for no supplier),
 * or a rule the host writes itself (a status the console works out from facts the server filters by). Unfinished
 * rules say nothing yet and are left out, so the input — and with it the read — changes only when what it asks does.
 */

/** What a table that pages on the server asks its host for: the filter, the search, the order and the page. */
export type TableQuery = {
  filter: Group
  q: string
  sort: { id: string; desc: boolean } | null
  /** The page after this cursor; null for the first. */
  cursor: string | null
  limit: number
}

/** How one of the table's filter fields reads on the server. */
export type ServerField =
  /** The server's field of that name, values as they are. */
  | string
  | {
    readonly field: string
    /** The table's value → the server's. */
    readonly values?: Readonly<Record<string, string>>
    /** The table's value that stands for nothing (the server's empty). */
    readonly blank?: string
  }
  /** The host's own condition; undefined says nothing. */
  | ((rule: Rule) => FilterNode | undefined)

/** One list on the server: its filter fields and its sort fields, by the table's column ids. */
export type ServerList = {
  readonly fields: Readonly<Record<string, ServerField>>
  readonly sorts: Readonly<Record<string, string>>
  /** What the host adds to every input of the list, whatever the table asks (the list's own input fields). */
  readonly extra?: Readonly<Record<string, unknown>>
}

/** A list's input as the server's lists take it (`ListInput`, and the host's `extra`), its keys always in this order. */
export type ServerInput = {
  filter?: Group
  q?: string
  sort?: { field: string; desc: boolean }
  cursor?: string
  limit: number
  readonly [extra: string]: unknown
}

const ruleOn = (rule: Rule, route: Exclude<ServerField, (rule: Rule) => unknown>): FilterNode => {
  const { field, values, blank } = typeof route === "string"
    ? { field: route, values: undefined, blank: undefined }
    : route
  const rename = (v: string) => values?.[v] ?? v
  if (Array.isArray(rule.value) && (rule.op === "any" || rule.op === "none")) {
    const chosen: ReadonlyArray<string> = rule.value
    const named = chosen.filter((v) => v !== blank).map(rename)
    const base: Rule = { kind: "rule", id: rule.id, field, op: rule.op, value: named }
    if (blank === undefined || !chosen.includes(blank)) return base
    const nothing: Rule = {
      kind: "rule",
      id: `${rule.id}-blank`,
      field,
      op: rule.op === "any" ? "empty" : "not_empty",
      value: ""
    }
    if (named.length === 0) return nothing
    return { kind: "group", id: `${rule.id}-or`, join: rule.op === "any" ? "or" : "and", children: [base, nothing] }
  }
  const value = Array.isArray(rule.value) ? rule.value.map(rename) : rename(String(rule.value))
  return { kind: "rule", id: rule.id, field, op: rule.op, value }
}

/** The filter in the server's words; undefined when it says nothing. A field the server does not know is left out. */
export function serverFilter(node: FilterNode, list: ServerList): FilterNode | undefined {
  if (node.kind === "rule") {
    if (!isComplete(node)) return undefined
    const route = list.fields[node.field]
    if (route === undefined) return undefined
    return typeof route === "function" ? route(node) : ruleOn(node, route)
  }
  const children = node.children.flatMap((c) => {
    const out = serverFilter(c, list)
    return out === undefined ? [] : [out]
  })
  return children.length === 0 ? undefined : { kind: "group", id: node.id, join: node.join, children }
}

const asGroup = (node: FilterNode): Group =>
  node.kind === "group" ? node : { kind: "group", id: "root", join: "and", children: [node] }

/** The table's query as the list's input; the same query always gives the same input, key for key. */
export function serverInput(query: TableQuery, list: ServerList): ServerInput {
  const filter = serverFilter(query.filter, list)
  const q = query.q.trim()
  const sort = query.sort === null ? undefined : list.sorts[query.sort.id]
  return {
    ...(filter === undefined ? {} : { filter: asGroup(filter) }),
    ...(q === "" ? {} : { q }),
    ...(sort === undefined || query.sort === null ? {} : { sort: { field: sort, desc: query.sort.desc } }),
    ...list.extra,
    ...(query.cursor === null ? {} : { cursor: query.cursor }),
    limit: query.limit
  }
}

/** The first page of a list as the table asks for it before anything is chosen: what a route reads ahead. */
export const firstQuery = (sort: TableQuery["sort"], limit: number): TableQuery => ({
  filter: { kind: "group", id: "root", join: "and", children: [] },
  q: "",
  sort,
  cursor: null,
  limit
})
