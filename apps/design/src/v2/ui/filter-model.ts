/*
 * What a list is cut by, as data: rules joined by En or Of, and groups of rules inside that, so
 * "(Status is Vertraagd of Vervoerder is DHL) en Totaal is hoger dan 100" can be said. Pure data and
 * pure functions: the builder (`filters.tsx`), the chips and a saved view (`views.ts`) mean the same
 * thing by one rule.
 *
 * A field knows its type, and the type decides what can be asked of it: an option is or is not one of
 * a set, text contains, a number is above or below, a date is in the last few days or before or after
 * a day. A rule with nothing filled in yet matches everything, so adding a row never empties the list
 * before the person has said what they meant.
 */

export type FieldType = "option" | "text" | "number" | "date"

/** A field the builder can filter on: its type, its options (for `option`) and how a row answers it. */
export type TypedField<T> = {
  readonly key: string
  readonly label: string
  readonly type: FieldType
  /** For an option field; without them the options come from the rows. */
  readonly options?: ReadonlyArray<string>
  /** The row's value: a word for an option or text, a number, an ISO day (`2026-11-22`) for a date. */
  readonly get: (row: T) => string | number | null | undefined
}

export type Op =
  | "any"
  | "none"
  | "contains"
  | "not_contains"
  | "is"
  | "gt"
  | "lt"
  | "last_days"
  | "before"
  | "after"
  | "empty"
  | "not_empty"

export type Rule = {
  readonly kind: "rule"
  readonly id: string
  readonly field: string
  readonly op: Op
  readonly value: ReadonlyArray<string> | string
}
export type Join = "and" | "or"
export type Group = {
  readonly kind: "group"
  readonly id: string
  readonly join: Join
  readonly children: ReadonlyArray<Rule | Group>
}
type FilterNode = Rule | Group

export const OPS: Readonly<Record<FieldType, ReadonlyArray<{ readonly op: Op; readonly label: string }>>> = {
  option: [
    { op: "any", label: "is een van" },
    { op: "none", label: "is geen van" },
    { op: "empty", label: "is leeg" },
    { op: "not_empty", label: "is ingevuld" }
  ],
  text: [
    { op: "contains", label: "bevat" },
    { op: "not_contains", label: "bevat niet" },
    { op: "is", label: "is precies" },
    { op: "empty", label: "is leeg" },
    { op: "not_empty", label: "is ingevuld" }
  ],
  number: [
    { op: "gt", label: "is hoger dan" },
    { op: "lt", label: "is lager dan" },
    { op: "is", label: "is gelijk aan" }
  ],
  date: [
    { op: "last_days", label: "in de afgelopen" },
    { op: "after", label: "is na" },
    { op: "before", label: "is voor" }
  ]
}

/** Operators that need no value: the rule says something as soon as they are picked. */
export const VALUELESS: ReadonlySet<Op> = new Set<Op>(["empty", "not_empty"])

let seq = 0
const nodeId = () => `f${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const emptyGroup = (join: Join = "and"): Group => ({ kind: "group", id: nodeId(), join, children: [] })

/** A new rule on a field, with the field's first operator. A date starts at "in de afgelopen 30 dagen". */
export function ruleFor<T>(field: TypedField<T>): Rule {
  const op = OPS[field.type][0]?.op ?? "contains"
  const value = field.type === "option" ? [] : field.type === "date" ? "30" : ""
  return { kind: "rule", id: nodeId(), field: field.key, op, value }
}

/** A group of one rule, for "Groep toevoegen": its join starts at Of, the reason to have a group. */
export const groupFor = <T>(field: TypedField<T>): Group => ({ ...emptyGroup("or"), children: [ruleFor(field)] })

/** Whether a rule says anything yet. An unfinished rule is shown but does not filter. */
function isComplete(rule: Rule): boolean {
  if (VALUELESS.has(rule.op)) return true
  return Array.isArray(rule.value) ? rule.value.length > 0 : String(rule.value).trim() !== ""
}

/** Picking an operator of another shape resets the value to that shape. */
export function retype(value: Rule["value"], type: FieldType, op: Op): Rule["value"] {
  if (type === "option") return Array.isArray(value) ? value : []
  if (op === "last_days") return Array.isArray(value) || value === "" || Number.isNaN(Number(value)) ? "30" : value
  return Array.isArray(value) ? "" : value
}

const DAY = 86_400_000
const lower = (x: unknown) => String(x ?? "").toLocaleLowerCase("nl-NL")

function matchRule<T>(row: T, rule: Rule, fields: ReadonlyArray<TypedField<T>>, today: number): boolean {
  const field = fields.find((f) => f.key === rule.field)
  if (field === undefined || !isComplete(rule)) return true
  const raw = field.get(row)
  const blank = raw === undefined || raw === null || raw === ""
  if (rule.op === "empty") return blank
  if (rule.op === "not_empty") return !blank
  const values = Array.isArray(rule.value) ? rule.value : [String(rule.value)]
  const one = String(rule.value)
  switch (rule.op) {
    case "any":
      return values.includes(String(raw))
    case "none":
      return !values.includes(String(raw))
    case "contains":
      return lower(raw).includes(lower(one))
    case "not_contains":
      return !lower(raw).includes(lower(one))
    case "is":
      return field.type === "number" ? Number(raw) === Number(one) : lower(raw) === lower(one)
    case "gt":
      return Number(raw) > Number(one)
    case "lt":
      return Number(raw) < Number(one)
    case "last_days": {
      const at = Date.parse(String(raw))
      return Number.isFinite(at) && at > today - Number(one) * DAY && at <= today
    }
    case "after":
      return Date.parse(String(raw)) > Date.parse(one)
    case "before":
      return Date.parse(String(raw)) < Date.parse(one)
  }
}

function matches<T>(row: T, node: FilterNode, fields: ReadonlyArray<TypedField<T>>, today: number): boolean {
  if (node.kind === "rule") return matchRule(row, node, fields, today)
  const live = node.children.filter((c) => countRules(c) > 0)
  if (live.length === 0) return true
  return node.join === "and"
    ? live.every((c) => matches(row, c, fields, today))
    : live.some((c) => matches(row, c, fields, today))
}

/**
 * The rows the filter lets through. `today` is the day "in de afgelopen" counts back from (an ISO day
 * or a time); the fixtures live in their own week, so a list passes its own.
 */
export function applyFilter<T>(
  rows: ReadonlyArray<T>,
  root: Group,
  fields: ReadonlyArray<TypedField<T>>,
  today: string | number = Date.now()
): ReadonlyArray<T> {
  const now = typeof today === "number" ? today : Date.parse(today)
  return countRules(root) === 0 ? rows : rows.filter((r) => matches(r, root, fields, now))
}

/** Rules that actually filter, at any depth. */
export function countRules(node: FilterNode): number {
  if (node.kind === "rule") return isComplete(node) ? 1 : 0
  return node.children.reduce((n, c) => n + countRules(c), 0)
}

/* ── editing, without changing what was there ── */

/** Replace one node (by id, at any depth); `null` takes it out. */
export function updateNode(root: Group, id: string, fn: (n: FilterNode) => FilterNode | null): Group {
  if (root.id === id) {
    const next = fn(root)
    return next !== null && next.kind === "group" ? next : emptyGroup(root.join)
  }
  const walk = (g: Group): Group => ({
    ...g,
    children: g.children.flatMap((c) => {
      if (c.id === id) {
        const next = fn(c)
        return next === null ? [] : [next]
      }
      return c.kind === "group" ? [walk(c)] : [c]
    })
  })
  return walk(root)
}

export const appendTo = (root: Group, groupId: string, node: FilterNode): Group =>
  updateNode(root, groupId, (g) => (g.kind === "group" ? { ...g, children: [...g.children, node] } : g))

/** A filter node without its ids or unfinished rules, to compare by meaning. */
const strip = (n: FilterNode): unknown =>
  n.kind === "rule"
    ? isComplete(n) ? [n.field, n.op, n.value] : null
    : [n.join, n.children.map(strip).filter((x) => x !== null)]

/** Two filters that say the same thing, whatever their ids: a saved view and the filter on screen. */
export function sameFilter(a: Group, b: Group): boolean {
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b))
}

const DATE = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" })

/** One rule as a chip says it: "Status", "is een van", "Vertraagd, Betaald". */
export function describeRule<T>(rule: Rule, fields: ReadonlyArray<TypedField<T>>) {
  const field = fields.find((f) => f.key === rule.field)
  const op = field === undefined ? rule.op : OPS[field.type].find((o) => o.op === rule.op)?.label ?? rule.op
  let value = ""
  if (Array.isArray(rule.value)) {
    value = rule.value.length > 2
      ? `${rule.value.slice(0, 2).join(", ")} +${rule.value.length - 2}`
      : rule.value.join(", ")
  } else if (!VALUELESS.has(rule.op)) {
    const one = String(rule.value)
    value = rule.op === "last_days"
      ? `${one} ${one === "1" ? "dag" : "dagen"}`
      : field?.type === "date" && Number.isFinite(Date.parse(one))
      ? DATE.format(new Date(one)).replace(".", "")
      : one
  }
  return { field: field?.label ?? rule.field, op, value }
}
