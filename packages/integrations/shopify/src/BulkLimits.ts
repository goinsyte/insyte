/*
 * Shopify's rules for a bulk query (shopify.dev/docs/api/usage/bulk-operations/queries): five connections at most in
 * the whole query, and a connection nested in no more than one other (two levels deep). Shopify takes a query that
 * breaks them with HTTP 200 and a user error on `bulkOperationRunQuery`, so the recorded twin checks every bulk query
 * Insyte starts the same way, and a test holds each of Insyte's queries to them.
 *
 * A field is a connection when its selection reads `edges` or `nodes`; lists (`fulfillments(first: 50)`,
 * `quantities(...)`) are not. Arguments, strings and comments are skipped; an inline fragment's fields count as its
 * parent's. That is all the reading the rules need, not a GraphQL parser.
 */

const MAX_CONNECTIONS = 5
const MAX_DEPTH = 2

interface Field {
  readonly name: string
  readonly children: ReadonlyArray<Field>
}

/** `{`, `}`, `...`, `:` and names, in order; arguments, strings, comments and the rest are left out. */
const tokens = (query: string): Array<string> => {
  const out: Array<string> = []
  let i = 0
  let parens = 0
  while (i < query.length) {
    const c = query[i]!
    if (c === "#") {
      while (i < query.length && query[i] !== "\n") i++
    } else if (c === "\"") {
      i++
      while (i < query.length && query[i] !== "\"") i += query[i] === "\\" ? 2 : 1
      i++
    } else if (c === "(") {
      parens++
      i++
    } else if (c === ")") {
      parens--
      i++
    } else if (parens > 0) {
      i++
    } else if (c === "{" || c === "}" || c === ":") {
      out.push(c)
      i++
    } else if (query.startsWith("...", i)) {
      out.push("...")
      i += 3
    } else if (/[_A-Za-z]/.test(c)) {
      const start = i
      while (i < query.length && /\w/.test(query[i]!)) i++
      out.push(query.slice(start, i))
    } else {
      i++
    }
  }
  return out
}

/** The selection set that starts after `at` (just past its `{`), and where it ends. */
const selection = (list: ReadonlyArray<string>, at: number): { fields: Array<Field>; end: number } => {
  const fields: Array<Field> = []
  let i = at
  while (i < list.length && list[i] !== "}") {
    const token = list[i]!
    if (token === "...") {
      // `... on Type { … }`: its fields are the parent's. A named fragment spread has nothing to count here.
      i++
      if (list[i] === "on") i += 2
      if (list[i] === "{") {
        const inner = selection(list, i + 1)
        fields.push(...inner.fields)
        i = inner.end + 1
      }
      continue
    }
    if (token === "{" || token === ":") {
      i++
      continue
    }
    // `alias: field`: the field is the name after the colon.
    let name = token
    i++
    if (list[i] === ":") {
      name = list[i + 1] ?? name
      i += 2
    }
    if (list[i] === "{") {
      const inner = selection(list, i + 1)
      fields.push({ name, children: inner.fields })
      i = inner.end + 1
    } else {
      fields.push({ name, children: [] })
    }
  }
  return { fields, end: i }
}

/** How many connections the query holds, and how deep the deepest sits (a top-level connection is one deep). */
export const bulkShape = (query: string): { readonly connections: number; readonly depth: number } => {
  const list = tokens(query)
  const open = list.indexOf("{")
  const root = open === -1 ? [] : selection(list, open + 1).fields
  let connections = 0
  let depth = 0
  const walk = (fields: ReadonlyArray<Field>, level: number) => {
    for (const field of fields) {
      const connection = field.children.some((c) => c.name === "edges" || c.name === "nodes")
      const here = connection ? level + 1 : level
      if (connection) {
        connections++
        depth = Math.max(depth, here)
      }
      walk(field.children, here)
    }
  }
  walk(root, 0)
  return { connections, depth }
}

/** Shopify's user error for a bulk query that breaks its limits, or `undefined` for one it takes. */
export const bulkQueryProblem = (query: string): string | undefined => {
  const { connections, depth } = bulkShape(query)
  if (depth > MAX_DEPTH) {
    return `Bulk queries cannot contain connections nested more than ${MAX_DEPTH} levels deep (this one: ${depth}).`
  }
  if (connections > MAX_CONNECTIONS) {
    return `Bulk queries cannot contain more than ${MAX_CONNECTIONS} connections (this one: ${connections}).`
  }
  return undefined
}
