import { useMemo, useSyncExternalStore } from "react"
import { API, chatSeed, NOTIFY_ROWS, PROFILE, SUP_PRODUCTS, supplierRows } from "../../fixtures/supplier-portal.ts"
import type { ChatMessage, Parcel, Platform, Problem, StockMode, SupOrder } from "../../fixtures/supplier-portal.ts"
import { toast } from "../../ui/toast.tsx"
import { useView } from "../../view.ts"

/**
 * What Allure did in this visit: orders accepted, shipped or reported, stock and lead times changed,
 * messages sent, the check sent in, the course followed, its settings. Kept in memory; a reload starts
 * from the fixtures again, as the current demo's `useSupplierWork` does.
 */
type OrderWork = {
  readonly acceptedAt?: Date
  readonly parcel?: Parcel
  /** `null`: a problem that was there is solved. */
  readonly problem?: Problem | null
}

type CheckSent = {
  readonly batch: string
  readonly note: string
  readonly files: ReadonlyArray<string>
  readonly at: Date
}

export type SupplierState = {
  readonly work: Readonly<Record<string, OrderWork>>
  readonly stock: Readonly<Record<string, number>>
  readonly lead: Readonly<Record<string, number>>
  readonly mode: Readonly<Record<string, StockMode>>
  readonly chat: ReadonlyArray<ChatMessage>
  readonly chatRead: boolean
  readonly checks: Readonly<Record<string, CheckSent>>
  readonly course: Readonly<
    Record<string, { readonly step: number; readonly answers: Readonly<Record<string, number>> }>
  >
  readonly profile: typeof PROFILE
  readonly api: { readonly enabled: boolean; readonly platform: Platform; readonly url: string; readonly key: string }
  readonly notify: Readonly<Record<string, boolean>>
  readonly read: ReadonlySet<string>
}

const initial = (): SupplierState => ({
  work: {},
  stock: {},
  lead: {},
  mode: {},
  chat: chatSeed(),
  chatRead: false,
  checks: {},
  course: {},
  profile: PROFILE,
  api: API,
  notify: Object.fromEntries(NOTIFY_ROWS.map((r) => [r.key, r.key !== "overzicht"])),
  read: new Set()
})

let state: SupplierState | undefined
const listeners = new Set<() => void>()

const getSupplier = () => {
  state ??= initial()
  return state
}

export function setSupplier(next: (s: SupplierState) => SupplierState) {
  state = next(getSupplier())
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useSupplier(): SupplierState {
  return useSyncExternalStore(subscribe, getSupplier)
}

/** A change with "Ongedaan maken". */
export function changeWithUndo(title: string, next: (s: SupplierState) => SupplierState, body?: string) {
  const before = getSupplier()
  setSupplier(next)
  toast({
    title,
    ...(body === undefined ? {} : { body }),
    action: { label: "Ongedaan maken", onClick: () => setSupplier(() => before) }
  })
}

/** An order with what was done to it in this visit laid over it. */
function withWork(o: SupOrder, w: OrderWork | undefined): SupOrder {
  if (w === undefined) return o
  const problem = w.problem === null ? undefined : (w.problem ?? o.problem)
  const acceptedAt = w.acceptedAt ?? o.acceptedAt
  const parcel = w.parcel ?? o.parcel
  const status = o.status === "afgesloten"
    ? "afgesloten"
    : parcel !== undefined
    ? "verzonden"
    : problem !== undefined
    ? "probleem"
    : acceptedAt !== undefined
    ? "te-verzenden"
    : "te-accepteren"
  const { problem: _p, acceptedAt: _a, parcel: _c, ...rest } = o
  return {
    ...rest,
    status,
    handoff: w.problem?.newDate ?? o.handoff,
    ...(acceptedAt === undefined ? {} : { acceptedAt }),
    ...(parcel === undefined ? {} : { parcel }),
    ...(problem === undefined ? {} : { problem })
  }
}

/** Allure's orders in the view's week, with this visit's work. */
export function useOrders(): ReadonlyArray<SupOrder> {
  const druk = useView().staat === "druk"
  const { work } = useSupplier()
  return useMemo(() => supplierRows(druk).map((o) => withWork(o, work[o.number])), [druk, work])
}

/** Allure's products with this visit's stock, lead time and stock mode. */
export function useProducts() {
  const { stock, lead, mode } = useSupplier()
  return useMemo(
    () =>
      SUP_PRODUCTS.map((p) => ({
        ...p,
        lead: lead[p.id] ?? p.lead,
        mode: mode[p.id] ?? p.mode,
        variants: p.variants.map((v) => ({ ...v, stock: stock[v.id] ?? v.stock }))
      })),
    [stock, lead, mode]
  )
}

export function accept(numbers: ReadonlyArray<string>, at = new Date()) {
  changeWithUndo(
    numbers.length === 1 ? `#${numbers[0]} geaccepteerd` : `${numbers.length} bestellingen geaccepteerd`,
    (s) => ({
      ...s,
      work: { ...s.work, ...Object.fromEntries(numbers.map((n) => [n, { ...s.work[n], acceptedAt: at }])) }
    }),
    "Northwind ziet dat je ze klaarmaakt."
  )
}

export function ship(parcels: ReadonlyArray<{ readonly number: string; readonly parcel: Parcel }>) {
  changeWithUndo(
    parcels.length === 1 ? `#${parcels[0]?.number ?? ""} verzonden` : `${parcels.length} bestellingen verzonden`,
    (s) => ({
      ...s,
      work: {
        ...s.work,
        ...Object.fromEntries(
          parcels.map((
            { number, parcel }
          ) => [number, { ...s.work[number], acceptedAt: s.work[number]?.acceptedAt ?? parcel.at, parcel }])
        )
      }
    }),
    "Northwind en de klant krijgen de track & trace."
  )
}

export function report(numbers: ReadonlyArray<string>, problem: Problem) {
  changeWithUndo(
    numbers.length === 1 ? `Probleem met #${numbers[0]} gemeld` : `Probleem met ${numbers.length} bestellingen gemeld`,
    (s) => ({ ...s, work: { ...s.work, ...Object.fromEntries(numbers.map((n) => [n, { ...s.work[n], problem }])) } }),
    "Northwind maakt er een ticket van en houdt de klant op de hoogte."
  )
}

export function solve(number: string) {
  changeWithUndo(
    `Probleem met #${number} opgelost`,
    (s) => ({ ...s, work: { ...s.work, [number]: { ...s.work[number], problem: null } } }),
    "De bestelling staat weer bij Te verzenden."
  )
}
