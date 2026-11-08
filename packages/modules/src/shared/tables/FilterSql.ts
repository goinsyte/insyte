import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { Statement } from "effect/sql"
import {
  CursorInvalid,
  FilterFieldUnknown,
  type FilterGroup,
  type FilterNode,
  type FilterRule
} from "../domain/Filter.ts"

/*
 * The filter compiler (widgets/01; 07 "per list: filter compiler whitelist"): a FilterGroup into a SQL condition, over
 * the list's whitelist. A field's column is the whitelist's own text, never the rule's; every value is a parameter.
 * Numbers in money fields arrive in the currency's units ("12.50") and compare in minor units. And the keyset cursor
 * every list pages by: the last row's sort key, opaque to the caller.
 */

export interface FieldSql {
  /** The column or expression, trusted: written in the slice, never taken from a request. */
  readonly column: string
  readonly type: "option" | "text" | "number" | "date" | "tags"
  /** Money: the value is in units, the column in minor units. */
  readonly scale?: number
}

export type Whitelist = Readonly<Record<string, FieldSql>>

type Fragment = Statement.Fragment

const values = (rule: FilterRule) => (Array.isArray(rule.value) ? rule.value : [rule.value]).filter((v) => v !== "")
const single = (rule: FilterRule) => (Array.isArray(rule.value) ? rule.value[0] ?? "" : rule.value).trim()
const like = (text: string) => `%${text.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`

const complete = (rule: FilterRule) =>
  rule.op === "empty" || rule.op === "not_empty" ||
  (Array.isArray(rule.value) ? values(rule).length > 0 : single(rule) !== "")

const compileRule = (sql: SqlClient.SqlClient, rule: FilterRule, field: FieldSql): Fragment | undefined => {
  if (!complete(rule)) return undefined
  const column = sql.literal(field.column)
  const number = () => {
    const n = Number(single(rule).replace(",", "."))
    return Number.isFinite(n) ? Math.round(n * (field.scale ?? 1)) : undefined
  }
  switch (rule.op) {
    case "any":
      return field.type === "tags" ? sql`${column} && ${values(rule)}::text[]` : sql`${column} = any(${values(rule)})`
    case "none":
      return field.type === "tags"
        ? sql`not (${column} && ${values(rule)}::text[])`
        : sql`(${column} is null or not (${column} = any(${values(rule)})))`
    case "contains":
      return sql`${column} ilike ${like(single(rule))}`
    case "not_contains":
      return sql`(${column} is null or ${column} not ilike ${like(single(rule))})`
    case "is": {
      if (field.type !== "number") return sql`lower(${column}) = lower(${single(rule)})`
      const n = number()
      return n === undefined ? undefined : sql`${column} = ${n}`
    }
    case "gt":
    case "lt": {
      const n = number()
      if (n === undefined) return undefined
      return rule.op === "gt" ? sql`${column} > ${n}` : sql`${column} < ${n}`
    }
    case "last_days": {
      const days = Number(single(rule))
      return Number.isFinite(days)
        ? sql`${column} >= now() - make_interval(days => ${Math.max(0, Math.floor(days))})`
        : undefined
    }
    case "before":
    case "after": {
      const day = new Date(single(rule))
      if (Number.isNaN(day.getTime())) return undefined
      return rule.op === "before" ? sql`${column} < ${day}` : sql`${column} >= ${day}`
    }
    case "empty":
      return field.type === "tags" ? sql`cardinality(${column}) = 0` : sql`(${column} is null or ${column}::text = '')`
    case "not_empty":
      return field.type === "tags"
        ? sql`cardinality(${column}) > 0`
        : sql`(${column} is not null and ${column}::text <> '')`
  }
}

/** The filter as one condition (`true` when it says nothing yet), or the first field the list does not know. */
export const compileFilter = (
  sql: SqlClient.SqlClient,
  node: FilterNode | undefined,
  whitelist: Whitelist
): Effect.Effect<Fragment, FilterFieldUnknown> =>
  Effect.gen(function*() {
    const walk = (n: FilterNode): Effect.Effect<Fragment | undefined, FilterFieldUnknown> =>
      Effect.gen(function*() {
        if (n.kind === "rule") {
          const field = whitelist[n.field]
          if (field === undefined) return yield* new FilterFieldUnknown({ field: n.field })
          return compileRule(sql, n, field)
        }
        const parts: Array<Fragment> = []
        for (const child of (n as FilterGroup).children) {
          const part = yield* walk(child)
          if (part !== undefined) parts.push(part)
        }
        if (parts.length === 0) return undefined
        return (n as FilterGroup).join === "or" ? sql.or(parts) : sql.and(parts)
      })
    if (node === undefined) return sql`true`
    return (yield* walk(node)) ?? sql`true`
  })

/** A keyset cursor: the last row's sort key, base64url JSON. */
export const encodeCursor = (key: ReadonlyArray<string | number>) =>
  btoa(JSON.stringify(key)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")

export const decodeCursor = (
  cursor: string | undefined
): Effect.Effect<Array<string | number> | undefined, CursorInvalid> =>
  Effect.try({
    try: () => {
      if (cursor === undefined) return undefined
      const key = JSON.parse(atob(cursor.replaceAll("-", "+").replaceAll("_", "/"))) as unknown
      if (!Array.isArray(key) || key.some((k) => typeof k !== "string" && typeof k !== "number")) throw new Error()
      return key as Array<string | number>
    },
    catch: () => new CursorInvalid()
  })
