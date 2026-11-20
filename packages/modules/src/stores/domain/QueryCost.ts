/*
 * What an Admin GraphQL query asks Shopify for, in its cost points. Shopify refuses a query whose requested cost is over
 * 1000 before running it (MAX_COST_EXCEEDED), whatever the bucket holds. Its documented rule, counted here: a scalar
 * 0, an object 1, a mutation 10, a connection (or a list taking `first`) 2 plus `first` times its node, `nodes(ids:)`
 * its node once per id; nested connections multiply. Shopify now prices large connections below that (they grow more
 * slowly than `first`), so this is an upper bound: a query under it is under Shopify's. The recorded twin refuses a
 * query over the limit by it, and `stores-query-cost.test.ts` holds every query Insyte sends under 900.
 */

/** Shopify's limit on one query's requested cost. */
export const MAX_QUERY_COST = 1000

interface Field {
  readonly name: string
  /** How many of its node a connection or list asks for; `undefined` for an object. */
  readonly size: number | undefined
  readonly selection: ReadonlyArray<Field> | undefined
}

const TOKENS = /\.\.\.|[A-Za-z_$][\w$]*|-?\d+|[{}()[\]:@!,=]|"(?:[^"\\]|\\.)*"/g

/** The root selection of a query's text: fields with how many they ask for and their sub-selection. */
const parse = (text: string, variables: Readonly<Record<string, unknown>>): ReadonlyArray<Field> => {
  const tokens: ReadonlyArray<string> = text.match(TOKENS) ?? []
  let at = tokens.indexOf("{")
  /** An argument's value as a number of items: `first: 10`, `first: $n`, `ids: $ids` (its length). */
  const sizeOf = (token: string | undefined, list: boolean): number | undefined => {
    if (token === undefined) return undefined
    const value = token.startsWith("$") ? variables[token.slice(1)] : Number(token)
    if (list) return Array.isArray(value) ? value.length : undefined
    return typeof value === "number" && Number.isFinite(value) ? value : undefined
  }
  /** Past a parenthesised list from `(`, noting `first:` and `ids:`. */
  const args = (): number | undefined => {
    let size: number | undefined
    let depth = 0
    do {
      if (tokens[at] === "(") depth++
      if (tokens[at] === ")") depth--
      if (depth === 1 && tokens[at + 1] === ":") {
        if (tokens[at] === "first" || tokens[at] === "last") size = sizeOf(tokens[at + 2], false) ?? size
        if (tokens[at] === "ids") size = sizeOf(tokens[at + 2], true) ?? size
      }
      at++
    } while (depth > 0 && at < tokens.length)
    return size
  }
  const selection = (): Array<Field> => {
    const fields: Array<Field> = []
    at++ // past "{"
    while (at < tokens.length && tokens[at] !== "}") {
      if (tokens[at] === "...") {
        at += tokens[at + 1] === "on" ? 3 : 2 // `... on Type`, or a named fragment
        if (tokens[at] === "{") fields.push({ name: "...", size: undefined, selection: selection() })
        continue
      }
      let name = tokens[at++]!
      // An alias: `alias: field`.
      if (tokens[at] === ":") name = tokens[(at += 2) - 1]!
      const size = tokens[at] === "(" ? args() : undefined
      // Directives (`@idempotent(key: $key)`) cost nothing.
      while (tokens[at] === "@") {
        at += 2
        if (tokens[at] === "(") args()
      }
      fields.push({ name, size, selection: tokens[at] === "{" ? selection() : undefined })
    }
    at++ // past "}"
    return fields
  }
  return selection()
}

const costOf = (fields: ReadonlyArray<Field>): number =>
  fields.reduce((sum, field) => {
    if (field.selection === undefined) return sum
    if (field.name === "...") return sum + costOf(field.selection)
    if (field.size === undefined) return sum + 1 + costOf(field.selection)
    // A connection's node is under `edges { node }` or `nodes`; a list's is its own selection.
    const edges = field.selection.find((f) => f.name === "edges")?.selection?.find((f) => f.name === "node")
    const nodes = field.selection.find((f) => f.name === "nodes")
    const node = (edges ?? nodes)?.selection ?? field.selection
    const pageInfo = field.selection.some((f) => f.name === "pageInfo") ? 1 : 0
    return sum + 2 + pageInfo + field.size * (1 + costOf(node))
  }, 0)

/** The requested cost of a query's text (with its variables, for a `$first` or the ids of `nodes(ids:)`). */
export const requestedCost = (query: string, variables: Readonly<Record<string, unknown>> = {}): number => {
  const root = parse(query, variables)
  const mutation = /^\s*mutation\b/.test(query)
  // A mutation costs ten, and what it answers as any selection does.
  return mutation
    ? root.reduce((sum, field) => sum + 10 + (field.selection === undefined ? 0 : costOf(field.selection)), 0)
    : costOf(root)
}
