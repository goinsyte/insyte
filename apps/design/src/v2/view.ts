import { useSyncExternalStore } from "react"

/**
 * How the demo is being looked at, for design only: which state the screens are in, which role the
 * signed-in person has, and how far an affiliate's application is. It is the version 2 form of the
 * current demo's scenario and persona switchers (`src/app/fixtures/scenario.ts`, the persona menu).
 *
 * Every screen reads it with `useView()` and draws the matching state itself:
 *
 *   staat     gewoon   the normal Monday (the default)
 *             leeg     the first day after setup: every list empty, every screen its empty state
 *             laden    the data is on its way: the page's own skeleton
 *             fout     the data did not come: the page's error, with a way to try again
 *             druk     the busy week that breaks a layout: long names, many rows
 *   rol       what the role may see and do; `level()` answers per area, as the server would
 *   affiliate the affiliate portal before, after or without approval
 *
 * A query parameter (`?staat=leeg`, `?rol=klantenservice`, `?affiliate=in-afwachting`) wins, so a
 * state can be linked; otherwise the last choice, remembered per browser. The avatar menu's
 * "Demoweergave" sets it.
 */

export type Staat = "gewoon" | "leeg" | "laden" | "fout" | "druk"
export type Rol = "eigenaar" | "beheerder" | "klantenservice" | "financien" | "alleen-lezen"
export type AffiliateStaat = "goedgekeurd" | "in-afwachting" | "afgewezen"

export type View = { readonly staat: Staat; readonly rol: Rol; readonly affiliate: AffiliateStaat }

export const STATEN: ReadonlyArray<{ readonly id: Staat; readonly label: string; readonly detail: string }> = [
  { id: "gewoon", label: "Gewone maandag", detail: "Een paar maanden in gebruik. Zo ziet de demo eruit." },
  { id: "leeg", label: "Eerste dag", detail: "Net na het inrichten: elke lijst is leeg." },
  { id: "laden", label: "Laden", detail: "De gegevens zijn onderweg." },
  { id: "fout", label: "Fout", detail: "De gegevens kwamen niet: elk scherm toont zijn fout." },
  { id: "druk", label: "Drukke week", detail: "Lange namen en veel rijen: de week die een layout breekt." }
]

export const ROLLEN: ReadonlyArray<{ readonly id: Rol; readonly label: string; readonly detail: string }> = [
  {
    id: "eigenaar",
    label: "Eigenaar",
    detail: "Alles, altijd. Er is er één, en alleen die kan de werkruimte overdragen of verwijderen."
  },
  { id: "beheerder", label: "Beheerder", detail: "Alles behalve het abonnement en de betaalmethode." },
  {
    id: "klantenservice",
    label: "Klantenservice",
    detail: "Tickets, inbox en chats, met de bestellingen en klanten erachter."
  },
  { id: "financien", label: "Financiën", detail: "Geld: terugbetalingen, chargebacks, analyse en facturatie." },
  { id: "alleen-lezen", label: "Alleen lezen", detail: "Ziet wat er gebeurt en verandert niets." }
]

export const AFFILIATE_STATEN: ReadonlyArray<{ readonly id: AffiliateStaat; readonly label: string }> = [
  { id: "goedgekeurd", label: "Goedgekeurd" },
  { id: "in-afwachting", label: "In afwachting" },
  { id: "afgewezen", label: "Afgewezen" }
]

/* ── permissions ───────────────────────────────────────────────────────────────────────────────── */

/** The permission areas, as `@insyte/domain/Permissions` names them. */
export type PermArea =
  | "orders"
  | "returns"
  | "customers"
  | "products"
  | "support"
  | "chargebacks"
  | "suppliers"
  | "affiliates"
  | "automations"
  | "analytics"
  | "data"
  | "settings"
  | "team"
  | "billing"
  | "integrations"
  | "courses"

/** 0 geen, 1 bekijken, 2 bewerken, 3 beheren. */
export type Level = 0 | 1 | 2 | 3

export const LEVEL_LABEL: Readonly<Record<Level, string>> = { 0: "Geen", 1: "Bekijken", 2: "Bewerken", 3: "Beheren" }

export const AREA_LABEL: Readonly<Record<PermArea, string>> = {
  orders: "Bestellingen",
  returns: "Retouren",
  customers: "Klanten",
  products: "Producten",
  support: "Klantenservice",
  chargebacks: "Chargebacks",
  suppliers: "Leveranciers",
  affiliates: "Affiliates",
  automations: "Automatiseringen",
  analytics: "Analyse",
  data: "Data en export",
  settings: "Instellingen",
  team: "Team en rollen",
  billing: "Facturatie",
  integrations: "Koppelingen en API",
  courses: "Cursussen"
}

const ALL: Readonly<Record<PermArea, Level>> = {
  orders: 3,
  returns: 3,
  customers: 3,
  products: 3,
  support: 3,
  chargebacks: 3,
  suppliers: 3,
  affiliates: 3,
  automations: 3,
  analytics: 3,
  data: 3,
  settings: 3,
  team: 3,
  billing: 3,
  integrations: 3,
  courses: 3
}
const NONE = Object.fromEntries(Object.keys(ALL).map((a) => [a, 0])) as Record<PermArea, Level>

/** The five system roles as they come out of the box (`SYSTEM_DEFAULTS` in the domain package). */
export const LEVELS: Readonly<Record<Rol, Readonly<Record<PermArea, Level>>>> = {
  eigenaar: ALL,
  beheerder: { ...ALL, billing: 1 },
  klantenservice: {
    ...NONE,
    orders: 2,
    returns: 2,
    customers: 2,
    products: 1,
    support: 3,
    chargebacks: 2,
    suppliers: 1,
    automations: 1,
    team: 1,
    courses: 1
  },
  financien: {
    ...NONE,
    orders: 2,
    returns: 1,
    customers: 1,
    products: 1,
    chargebacks: 3,
    suppliers: 1,
    affiliates: 2,
    analytics: 1,
    data: 1,
    billing: 3,
    team: 1,
    courses: 1
  },
  "alleen-lezen": {
    ...NONE,
    orders: 1,
    returns: 1,
    customers: 1,
    products: 1,
    support: 1,
    chargebacks: 1,
    suppliers: 1,
    affiliates: 1,
    automations: 1,
    analytics: 1,
    data: 1,
    settings: 1,
    team: 1,
    integrations: 1,
    courses: 1
  }
}

/** What the current role may do in an area. */
export const level = (view: View, area: PermArea): Level => LEVELS[view.rol][area]

/** The roles that do reach a level in an area, for "Beheerder en Eigenaar wel". */
export const rolesWith = (area: PermArea, at: Level): ReadonlyArray<string> =>
  ROLLEN.filter((r) => LEVELS[r.id][area] >= at).map((r) => r.label)

export const rolLabel = (rol: Rol) => ROLLEN.find((r) => r.id === rol)?.label ?? rol

/* ── the store ─────────────────────────────────────────────────────────────────────────────────── */

const KEY = "insyte:v2:view"
const DEFAULT: View = { staat: "gewoon", rol: "eigenaar", affiliate: "goedgekeurd" }

const isStaat = (x: unknown): x is Staat => STATEN.some((s) => s.id === x)
const isRol = (x: unknown): x is Rol => ROLLEN.some((r) => r.id === x)
const isAff = (x: unknown): x is AffiliateStaat => AFFILIATE_STATEN.some((a) => a.id === x)

function stored(): View {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return DEFAULT
    const v = JSON.parse(raw) as Partial<View>
    return {
      staat: isStaat(v.staat) ? v.staat : DEFAULT.staat,
      rol: isRol(v.rol) ? v.rol : DEFAULT.rol,
      affiliate: isAff(v.affiliate) ? v.affiliate : DEFAULT.affiliate
    }
  } catch {
    return DEFAULT
  }
}

let chosen: View = stored()
let cache: { key: string; view: View } | null = null
const listeners = new Set<() => void>()

/** The stored choice, overridden by the query of the current address. */
export function getView(): View {
  const q = new URLSearchParams(window.location.search)
  const staat = q.get("staat")
  const rol = q.get("rol")
  const affiliate = q.get("affiliate")
  const key = `${chosen.staat}|${chosen.rol}|${chosen.affiliate}|${staat}|${rol}|${affiliate}`
  if (cache?.key === key) return cache.view
  const view: View = {
    staat: isStaat(staat) ? staat : chosen.staat,
    rol: isRol(rol) ? rol : chosen.rol,
    affiliate: isAff(affiliate) ? affiliate : chosen.affiliate
  }
  cache = { key, view }
  return view
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener("popstate", listener)
  window.addEventListener("v2:navigate", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("popstate", listener)
    window.removeEventListener("v2:navigate", listener)
  }
}

/** The view; a component re-renders when it changes. */
export function useView(): View {
  return useSyncExternalStore(subscribe, getView)
}

/** Remember a new choice and drop the query that would override it. */
export function setView(next: Partial<View>) {
  chosen = { ...getView(), ...next }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(chosen))
  } catch {
    // Not remembered; it still applies for this visit.
  }
  const url = new URL(window.location.href)
  for (const k of ["staat", "rol", "affiliate"]) url.searchParams.delete(k)
  window.history.replaceState(null, "", url.pathname + url.search + url.hash)
  for (const listener of listeners) listener()
}

/**
 * The page's data state, from the view: `"ready"` draws the page, the others its empty, loading or
 * error state. `druk` is ready with the busy rows (`view.staat === "druk"`).
 */
export type DataState = "ready" | "empty" | "loading" | "error"

export function dataState(view: View): DataState {
  if (view.staat === "leeg") return "empty"
  if (view.staat === "laden") return "loading"
  if (view.staat === "fout") return "error"
  return "ready"
}
