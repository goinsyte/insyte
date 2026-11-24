import { useEffect, useState } from "react"
import { setQuery, useRoute } from "../../router.tsx"
import { applyFilter, countRules, emptyGroup, ruleFor, sameFilter } from "../../ui/filter-model.ts"
import type { Group, Join, Rule, TypedField } from "../../ui/filter-model.ts"
import { useSavedViews } from "../../ui/views.ts"

/*
 * What the record lists (orders, customers, products, tickets, suppliers, returns, chargebacks) share
 * about their filter: the builder's filter, kept in the address so a menu row, Start or another
 * record can link straight to a cut (`?status=vertraagd`, `?weergave=laag`), and so the back button
 * and a reload bring back what was on.
 *
 * The address says a filter the shortest way it can: a named cut (`?weergave=laag`) when the filter
 * is exactly that cut, one parameter per field (`?status=vertraagd,betaald&vervoerder=dhl`) when it is
 * a plain list of those, and otherwise the whole filter in `?filter=`. A link that arrives replaces
 * what was on, and picks the saved view that says the same thing.
 */

/** A field one row can hold several values of (an order's suppliers, a customer's labels). */
export type ListField<T> = TypedField<T> & { readonly many?: (row: T) => ReadonlyArray<string> }

/** A field with several values per row: `get` gives the first, which the builder counts by. */
export function manyField<T>(
  key: string,
  label: string,
  options: ReadonlyArray<string>,
  many: (row: T) => ReadonlyArray<string>
): ListField<T> {
  return { key, label, type: "option", options, get: (row) => many(row)[0], many }
}

/**
 * The rows the filter lets through, `applyFilter` with fields of several values understood: "is een
 * van A, B" holds when the row has A or B among its values, "is geen van" when it has neither.
 */
export function filterRows<T>(
  rows: ReadonlyArray<T>,
  root: Group,
  fields: ReadonlyArray<ListField<T>>,
  today: string | number
): ReadonlyArray<T> {
  const extra = new Map<string, TypedField<T>>()
  const rewrite = (node: Rule | Group): Rule | Group => {
    if (node.kind === "group") return { ...node, children: node.children.map(rewrite) }
    const field = fields.find((f) => f.key === node.field)
    const many = field?.many
    if (field === undefined || many === undefined) return node
    if (node.op === "empty" || node.op === "not_empty") {
      const key = `${field.key}\u0000`
      extra.set(key, { key, label: field.label, type: "text", get: (row) => many(row).join(", ") })
      return { ...node, field: key }
    }
    if (!Array.isArray(node.value) || node.value.length === 0) return node
    const children = node.value.map((value): Rule => {
      const key = `${field.key}\u0000${value}`
      extra.set(key, {
        key,
        label: field.label,
        type: "option",
        get: (row) => (many(row).includes(value) ? value : "")
      })
      return { ...node, id: `${node.id}-${value}`, field: key, value: [value] }
    })
    return { kind: "group", id: node.id, join: node.op === "none" ? "and" : "or", children }
  }
  const root2 = rewrite(root)
  return applyFilter(rows, root2.kind === "group" ? root2 : root, [...fields, ...extra.values()], today)
}

/* ── building filters, for the seeded views and the cuts ── */

export const rule = <T>(field: TypedField<T>, op: Rule["op"], value: Rule["value"]): Rule => ({
  ...ruleFor(field),
  op,
  value
})

export const where = (join: Join, ...children: ReadonlyArray<Rule | Group>): Group => ({
  ...emptyGroup(join),
  children
})

/** "2026-11-23", the day a date field answers with. */
export const isoDay = (at: Date | number) => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/* ── the filter in the address ── */

/** One parameter that holds one field: `?status=vertraagd,betaald`. */
type AddressParam = {
  readonly param: string
  readonly field: string
  /** The address's word for each value (`vertraagd` for "Vertraagd"); without it the address holds the value. */
  readonly values?: Readonly<Record<string, string>>
}

export type Address = {
  readonly params?: ReadonlyArray<AddressParam>
  /**
   * Named cuts the menus link to (`?weergave=laag`), each the filter it stands for. With `fallback`,
   * an address without a filter is that cut ("Open retouren"), and the whole list is `?weergave=alle`.
   */
  readonly cuts?: {
    readonly param: string
    readonly filters: Readonly<Record<string, Group>>
    readonly fallback?: string
  }
}

const ALL = "alle"

const WHOLE = "filter"

const keysOf = (address: Address) => [
  ...new Set([
    ...(address.cuts === undefined ? [] : [address.cuts.param]),
    ...(address.params ?? []).map((p) => p.param),
    WHOLE
  ])
]

const keyOf = (address: Address, get: (key: string) => string | null) =>
  JSON.stringify(keysOf(address).map((k) => get(k)))

type Packed = readonly [string, string, Rule["value"]] | { readonly j: Join; readonly c: ReadonlyArray<Packed> }

const pack = (node: Rule | Group): Packed =>
  node.kind === "rule" ? [node.field, node.op, node.value] : { j: node.join, c: node.children.map(pack) }

function unpack<T>(packed: unknown, fields: ReadonlyArray<TypedField<T>>): Rule | Group | null {
  if (Array.isArray(packed)) {
    const [key, op, value] = packed as ReadonlyArray<unknown>
    const field = fields.find((f) => f.key === key)
    if (field === undefined || typeof op !== "string") return null
    const v = Array.isArray(value) ? value.map(String) : String(value ?? "")
    return rule(field, op as Rule["op"], v)
  }
  if (typeof packed !== "object" || packed === null) return null
  const { j, c } = packed as { readonly j?: unknown; readonly c?: unknown }
  if (!Array.isArray(c)) return null
  const children = c.map((x) => unpack(x, fields)).filter((x): x is Rule | Group => x !== null)
  return where(j === "or" ? "or" : "and", ...children)
}

function fromAddress<T>(address: Address, fields: ReadonlyArray<TypedField<T>>, get: (key: string) => string | null) {
  const children: Array<Rule | Group> = []
  const cuts = address.cuts
  const fallback = cuts?.fallback === undefined ? undefined : cuts.filters[cuts.fallback]
  if (fallback !== undefined && keysOf(address).every((k) => get(k) === null)) return fallback
  const cut = cuts === undefined ? undefined : cuts.filters[get(cuts.param) ?? ""]
  if (cut !== undefined) children.push(...(cut.join === "and" ? cut.children : [cut]))
  for (const p of address.params ?? []) {
    const raw = get(p.param)
    const field = fields.find((f) => f.key === p.field)
    if (raw === null || raw === "" || field === undefined) continue
    if (cut !== undefined && p.param === cuts?.param) continue
    const words = raw.split(",").map((slug) => p.values?.[slug] ?? slug)
    children.push(field.type === "option" ? rule(field, "any", words) : rule(field, "is", words[0] ?? ""))
  }
  const whole = get(WHOLE)
  if (whole !== null) {
    try {
      const node = unpack(JSON.parse(whole), fields)
      if (node !== null && node.kind === "group" && children.length === 0) return node
      if (node !== null) children.push(node)
    } catch {
      // An address someone typed by hand: what cannot be read is left off.
    }
  }
  return where("and", ...children)
}

function toAddress<T>(filter: Group, address: Address, fields: ReadonlyArray<TypedField<T>>) {
  const out: Record<string, string | null> = Object.fromEntries(keysOf(address).map((k) => [k, null]))
  const cuts = address.cuts
  if (countRules(filter) === 0) return cuts?.fallback === undefined ? out : { ...out, [cuts.param]: ALL }
  const cut = cuts === undefined ? undefined : Object.entries(cuts.filters).find(([, g]) => sameFilter(g, filter))
  if (cuts !== undefined && cut !== undefined) return cut[0] === cuts.fallback ? out : { ...out, [cuts.param]: cut[0] }
  const live = filter.children.filter((c) => countRules(c) > 0)
  const flat: Record<string, string> = {}
  const plain = (filter.join === "and" || live.length === 1) && live.every((node) => {
    if (node.kind !== "rule") return false
    const p = (address.params ?? []).find((x) => x.field === node.field)
    const field = fields.find((f) => f.key === node.field)
    if (p === undefined || field === undefined || flat[p.param] !== undefined) return false
    const words = Array.isArray(node.value) ? node.value : [String(node.value)]
    if (node.op !== (field.type === "option" ? "any" : "is") || words.some((w) => w.includes(","))) return false
    const slug = (word: string) => Object.entries(p.values ?? {}).find(([, w]) => w === word)?.[0] ?? word
    flat[p.param] = words.map(slug).join(",")
    return true
  })
  return plain ? { ...out, ...flat } : { ...out, [WHOLE]: JSON.stringify(pack(filter)) }
}

/**
 * The filter a list shows, read from and written to the address, and the way to change it. `list`
 * is the saved views' key: a filter that arrives by a link turns on the view that says the same
 * thing, or "Alles". `onChange` runs on every change the person makes (back to the first page).
 */
export function useListFilter<T>(
  list: string,
  fields: ReadonlyArray<TypedField<T>>,
  address: Address,
  onChange?: () => void
): readonly [Group, (next: Group) => void] {
  useRoute()
  const search = new URLSearchParams(window.location.search)
  const get = (key: string) => search.get(key)
  const key = keyOf(address, get)
  const [state, setState] = useState(() => ({ key, filter: fromAddress(address, fields, get), arrived: 0 }))
  const views = useSavedViews(list)
  if (state.key !== key) setState({ key, filter: fromAddress(address, fields, get), arrived: state.arrived + 1 })

  // A filter that came in by the address: the view that says the same thing is the one on.
  const { setActive } = views
  const hit = views.views.find((v) => sameFilter(v.filter, state.filter))?.id ?? null
  // Only when a filter arrives (and on the first visit): a view the person is editing stays on.
  useEffect(() => setActive(hit), [state.arrived])

  const set = (next: Group) => {
    const out = toAddress(next, address, fields)
    setState((s) => ({ ...s, key: keyOf(address, (k) => out[k] ?? null), filter: next }))
    setQuery({ ...out, pagina: null })
    onChange?.()
  }
  return [state.filter, set]
}
