import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { Statement } from "effect/sql"
import {
  CursorInvalid,
  FilterFieldUnknown,
  type FilterGroup,
  type FilterNode,
  type FilterRule,
  type ListSort
} from "../domain/Filter.ts"

/*
 * The filter compiler (widgets/01; 07 "per list: filter compiler whitelist"): a FilterGroup into a SQL condition, over
 * the list's whitelist. A field's column is the whitelist's own text, never the rule's; every value is a parameter.
 * Numbers in money fields arrive in the currency's units ("12.50") and compare in minor units. And the keyset every
 * list pages by (`keyset`): an order from the list's own sort whitelist, the id as the tie-break, and the cursor as the
 * last row's key, opaque to the caller.
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
          const field = Object.hasOwn(whitelist, n.field) ? whitelist[n.field] : undefined
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

/** Whether the filter has a rule on any of these fields: a list adds what such a field reads only when it is asked. */
export const mentions = (node: FilterNode | undefined, fields: ReadonlyArray<string>): boolean =>
  node === undefined
    ? false
    : node.kind === "rule"
    ? fields.includes(node.field)
    : (node as FilterGroup).children.some((c) => mentions(c, fields))

export interface SortSql {
  /** The column or expression, trusted: written in the slice, never taken from a request. */
  readonly column: string
  /** Text sorts without case; a number or a date by its value. */
  readonly type: "text" | "number" | "date"
  /** A column that is never null keeps its index: no `coalesce` around it. */
  readonly required?: boolean
}

/** A list's orders: the fields it sorts by, its own order without one, and its id column (the tie-break). */
export interface Sorts {
  readonly fields: Readonly<Record<string, SortSql>>
  readonly default: ListSort
  readonly id: string
}

/* A sort key as one value per row: text without case and nothing as "", nothing first among numbers (0) and dates. */
const keyOf = (field: SortSql) => {
  const column = field.column
  switch (field.type) {
    case "text":
      return field.required === true ? `lower(${column})` : `lower(coalesce(${column}, ''))`
    case "number":
      return field.required === true ? column : `coalesce(${column}, 0)`
    case "date":
      return field.required === true ? column : `coalesce(${column}, '-infinity'::timestamptz)`
  }
}

/* What a key read back from a cursor must look like for its type, before the database casts it: a cursor is the
   caller's text, so anything the cast would refuse (a number past every bound, a 31st of February, a NUL, half a
   surrogate pair) is refused here as `CursorInvalid`, never left to fail in the database. */
const NUMBER = /^-?\d{1,30}(\.\d{1,30})?$/
const DATE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,6})?)?(Z|[+-](\d{2})(?::?(\d{2}))?)?$/
const LONE_SURROGATE = /\p{Cs}/u
const brokenText = (text: string) => text.includes("\u0000") || LONE_SURROGATE.test(text)

const validDate = (value: string) => {
  if (value === "-infinity" || value === "infinity") return true
  const m = DATE.exec(value)
  if (m === null) return false
  const [year, month, day, hour, minute, second, offsetHours, offsetMinutes] = [1, 2, 3, 4, 5, 6, 9, 10].map((i) =>
    Number(m[i] ?? 0)
  ) as [number, number, number, number, number, number, number, number]
  const calendar = new Date(Date.UTC(year, month - 1, day))
  return year >= 1 && calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day && hour <= 23 && minute <= 59 && second <= 59 && offsetHours <= 14 &&
    offsetMinutes <= 59
}

/* A cursor's key as text the database can cast for the sort's type; undefined when it could not be one. */
const keyText = (raw: string | number, type: SortSql["type"]): string | undefined => {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return undefined
    if (type !== "date") return NUMBER.test(String(raw)) ? String(raw) : undefined
    const at = new Date(raw)
    return Number.isNaN(at.getTime()) || at.getUTCFullYear() < 1 || at.getUTCFullYear() > 9999
      ? undefined
      : at.toISOString()
  }
  if (brokenText(raw)) return undefined
  if (type === "number") return NUMBER.test(raw) ? raw : undefined
  if (type === "date") return validDate(raw) ? raw : undefined
  return raw
}

/**
 * The list's order and its page after the cursor: `key` selects the row's sort key as `sort_key` (as Postgres writes
 * it, so a date keeps its microseconds and two rows in one millisecond are never skipped), `order` is the `order by`,
 * `after` the condition for the rows past the cursor, and `cursorOf` the next page's cursor from the last row.
 *
 * The list's own order hands out `[key, id]`, as every list did before it could be sorted (a cursor from then, an
 * order's placed time in milliseconds, still reads); any other order `[key, id, field, desc]`, so a cursor is refused
 * under an order it was not handed out under. A field the list does not sort by is refused as a filter field is.
 */
export const keyset = (
  sql: SqlClient.SqlClient,
  input: { readonly sort?: ListSort | undefined; readonly cursor?: string | undefined },
  sorts: Sorts
) =>
  Effect.gen(function*() {
    const want = input.sort ?? sorts.default
    const field = Object.hasOwn(sorts.fields, want.field) ? sorts.fields[want.field] : undefined
    if (field === undefined) return yield* new FilterFieldUnknown({ field: want.field })
    const own = want.field === sorts.default.field && want.desc === sorts.default.desc
    const expression = sql.literal(keyOf(field))
    const id = sql.literal(sorts.id)
    const direction = sql.literal(want.desc ? "desc" : "asc")
    const cursor = yield* decodeCursor(input.cursor)
    let after: Fragment = sql`true`
    if (cursor !== undefined) {
      const [raw, last, named, desc] = cursor
      const fits = cursor.length === 2
        ? own
        : cursor.length === 4 && named === want.field && desc === (want.desc ? 1 : 0)
      if (!fits || typeof last !== "string" || raw === undefined || brokenText(last)) {
        return yield* new CursorInvalid()
      }
      const value = keyText(raw, field.type)
      if (value === undefined) return yield* new CursorInvalid()
      const key = field.type === "date"
        ? sql`${value}::timestamptz`
        : field.type === "number"
        ? sql`${value}::numeric`
        : sql`${value}`
      after = want.desc
        ? sql`(${expression}, ${id}) < (${key}, ${last})`
        : sql`(${expression}, ${id}) > (${key}, ${last})`
    }
    return {
      key: sql`(${expression})::text as sort_key`,
      order: sql`order by ${expression} ${direction}, ${id} ${direction}`,
      after,
      cursorOf: (row: { readonly sortKey: string; readonly id: string }) =>
        encodeCursor(own ? [row.sortKey, row.id] : [row.sortKey, row.id, want.field, want.desc ? 1 : 0])
    }
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
