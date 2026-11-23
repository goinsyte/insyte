import { useSyncExternalStore } from "react"
import type { AnchorHTMLAttributes, MouseEvent } from "react"

/**
 * `/v2`'s router: a route table, a matcher and a `Link`, on the History API.
 *
 * Small on purpose. The product's file-routed TanStack tree registers its own routes for the whole
 * type program (`tsconfig.json`), so a second TanStack router here could not type its links; and a
 * prototype that is all client state over fixtures needs nothing more than "which screen, with which
 * parameters". When a screen moves into the product it takes a TanStack route there; the screens do
 * not import anything from this file but `Link`, `paths` and `useRoute`.
 */

export type Route =
  | { readonly name: "home" }
  | { readonly name: "new-chat"; readonly context: string | null }
  | { readonly name: "chat"; readonly chatId: string }
  | { readonly name: "agents" }
  | { readonly name: "agent"; readonly agentId: string }
  | { readonly name: "log" }
  | { readonly name: "board"; readonly boardId: string | null }
  | { readonly name: "live" }
  | { readonly name: "parts" }
  | { readonly name: "brand" }
  | { readonly name: "more" }
  | AreaRoute
  | { readonly name: "soon"; readonly section: string; readonly page: string | null }

/**
 * Every area of the product that is not one of the screens above: its own folder
 * (`screens/<area>/`), its own fixture (`fixtures/<area>.ts`), its own pages under one or more URL
 * prefixes. The router only says which area and what is left of the path; the area's `Screen` reads
 * `path` and draws the page (`areas.ts`).
 */
export type AreaId =
  | "inbox"
  | "orders"
  | "returns"
  | "chargebacks"
  | "customers"
  | "products"
  | "suppliers"
  | "affiliates"
  | "automations"
  | "sheets"
  | "courses"
  | "costs"
  | "data"
  | "marketplace"
  | "notifications"
  | "settings"
  | "magnus"
  | "affiliate-portal"
  | "supplier-portal"
  | "auth"
  | "public"

/** How a page is framed: inside the product's shell, the portal's reduced shell, or alone. */
export type Layout = "shell" | "portal" | "bare"

export type AreaRoute = {
  readonly name: "area"
  readonly area: AreaId
  /** The prefix that matched, without `/v2/`: `"instellingen"`, `"live/winkelchat"`. */
  readonly base: string
  /** What is left of the path after the prefix: `["5309"]`, `["ai", "kennisbank"]`. */
  readonly path: ReadonlyArray<string>
  /** The raw query, with its `?`, for an area that filters by it. */
  readonly search: string
  /** The rail area the page belongs to, which picks the menu. */
  readonly section: string
  readonly layout: Layout
}

/**
 * The URL prefixes, longest first, and the area each one belongs to. A prefix is Dutch, as the
 * product's addresses are; the area id is the folder.
 */
export const AREA_PREFIXES: ReadonlyArray<{
  readonly prefix: string
  readonly area: AreaId
  readonly section: string
  readonly layout: Layout
}> = [
  { prefix: "live/winkelchat", area: "inbox", section: "live", layout: "shell" },
  { prefix: "start/meldingen", area: "notifications", section: "start", layout: "shell" },
  { prefix: "magnus/goedkeuringen", area: "magnus", section: "magnus", layout: "shell" },
  { prefix: "magnus/gepland", area: "magnus", section: "magnus", layout: "shell" },
  { prefix: "magnus/galerij", area: "magnus", section: "magnus", layout: "shell" },
  { prefix: "portaal/affiliate", area: "affiliate-portal", section: "portaal-affiliate", layout: "portal" },
  { prefix: "portaal/leverancier", area: "supplier-portal", section: "portaal-leverancier", layout: "portal" },
  { prefix: "inbox", area: "inbox", section: "inbox", layout: "shell" },
  { prefix: "bestellingen", area: "orders", section: "bestellingen", layout: "shell" },
  { prefix: "retouren", area: "returns", section: "retouren", layout: "shell" },
  { prefix: "chargebacks", area: "chargebacks", section: "chargebacks", layout: "shell" },
  { prefix: "klanten", area: "customers", section: "klanten", layout: "shell" },
  { prefix: "producten", area: "products", section: "producten", layout: "shell" },
  { prefix: "leveranciers", area: "suppliers", section: "leveranciers", layout: "shell" },
  { prefix: "affiliates", area: "affiliates", section: "affiliates", layout: "shell" },
  { prefix: "automatiseringen", area: "automations", section: "automatiseringen", layout: "shell" },
  { prefix: "sheets", area: "sheets", section: "meer", layout: "shell" },
  { prefix: "cursussen", area: "courses", section: "meer", layout: "shell" },
  { prefix: "kosten", area: "costs", section: "meer", layout: "shell" },
  { prefix: "data", area: "data", section: "meer", layout: "shell" },
  { prefix: "marketplace", area: "marketplace", section: "meer", layout: "shell" },
  { prefix: "instellingen", area: "settings", section: "instellingen", layout: "shell" },
  { prefix: "team", area: "settings", section: "instellingen", layout: "shell" },
  { prefix: "inloggen", area: "auth", section: "auth", layout: "bare" },
  { prefix: "registreren", area: "auth", section: "auth", layout: "bare" },
  { prefix: "wachtwoord-herstellen", area: "auth", section: "auth", layout: "bare" },
  { prefix: "uitnodiging", area: "auth", section: "auth", layout: "bare" },
  { prefix: "inrichten", area: "auth", section: "auth", layout: "bare" },
  { prefix: "retour", area: "public", section: "public", layout: "bare" },
  { prefix: "kwaliteit", area: "public", section: "public", layout: "bare" }
]

/** Every address `/v2` links to, so a path is written once. */
export const paths = {
  home: "/v2",
  newChat: (context?: string) =>
    context === undefined ? "/v2/magnus" : `/v2/magnus?context=${encodeURIComponent(context)}`,
  chat: (chatId: string) => `/v2/magnus/chat/${chatId}`,
  agents: "/v2/magnus/agents",
  /** Everything the agents did, across all of them, with the rule each line ran under. */
  log: "/v2/magnus/logboek",
  live: "/v2/live",
  /** The UI kit: every reusable piece of this version, by section, in every state and theme. */
  parts: "/v2/kit",
  /** The brand exploration: the three marks and six palette directions. */
  brand: "/v2/merk",
  agent: (agentId: string) => `/v2/magnus/agents/${agentId}`,
  board: (boardId: string) => `/v2/analyse/${boardId}`,
  section: (section: string, page?: string) => (page === undefined ? `/v2/${section}` : `/v2/${section}/${page}`),
  /** The tools that are not on the rail: affiliates, sheets, courses, costs, data, marketplace. */
  more: "/v2/meer",

  /* The areas. Every record link goes through one of these, so two areas never spell a path twice. */
  inbox: "/v2/inbox",
  ticket: (id: string) => `/v2/inbox/${id.replace(/^#/, "")}`,
  tickets: "/v2/inbox/tickets",
  teamChat: "/v2/inbox/teamchat",
  storeChat: "/v2/live/winkelchat",
  orders: "/v2/bestellingen",
  order: (number: string) => `/v2/bestellingen/${number.replace(/^#/, "")}`,
  returns: "/v2/retouren",
  return: (id: string) => `/v2/retouren/${id}`,
  chargebacks: "/v2/chargebacks",
  chargeback: (id: string) => `/v2/chargebacks/${id.toLowerCase()}`,
  customers: "/v2/klanten",
  customer: (id: string) => `/v2/klanten/${id}`,
  products: "/v2/producten",
  product: (id: string) => `/v2/producten/${id}`,
  suppliers: "/v2/leveranciers",
  supplier: (id: string) => `/v2/leveranciers/${id}`,
  affiliates: "/v2/affiliates",
  automations: "/v2/automatiseringen",
  automation: (id: string) => `/v2/automatiseringen/${id}`,
  sheets: "/v2/sheets",
  sheet: (id: string) => `/v2/sheets/${id}`,
  courses: "/v2/cursussen",
  course: (id: string) => `/v2/cursussen/${id}`,
  costs: "/v2/kosten",
  data: "/v2/data",
  marketplace: "/v2/marketplace",
  notifications: "/v2/start/meldingen",
  approvals: "/v2/magnus/goedkeuringen",
  scheduled: "/v2/magnus/gepland",
  gallery: "/v2/magnus/galerij",
  /** A settings page: `settings("team")`, `settings("ai/kennisbank")`. */
  settings: (page?: string) => (page === undefined ? "/v2/instellingen" : `/v2/instellingen/${page}`),
  person: (id: string) => `/v2/team/${id}`,
  affiliatePortal: (page?: string) => page === undefined ? "/v2/portaal/affiliate" : `/v2/portaal/affiliate/${page}`,
  supplierPortal: (page?: string) => page === undefined ? "/v2/portaal/leverancier" : `/v2/portaal/leverancier/${page}`,
  login: "/v2/inloggen",
  twoFactor: "/v2/inloggen/twee-stappen",
  register: "/v2/registreren",
  resetPassword: "/v2/wachtwoord-herstellen",
  onboarding: (persona?: "merk" | "leverancier" | "affiliate") =>
    persona === undefined ? "/v2/inrichten" : `/v2/inrichten/${persona}`,
  invitation: (id: string) => `/v2/uitnodiging/${id}`,
  returnPortal: (storeHandle: string) => `/v2/retour/${storeHandle}`,
  qualityCheck: (checkId: string) => `/v2/kwaliteit/${checkId}`
} as const

export function matchRoute(pathname: string, search: string): Route {
  const parts = pathname.replace(/^\/v2\/?/, "").split("/").filter((part) => part !== "")
  const [section, a, b] = parts

  if (section === undefined) return { name: "home" }
  if (section === "magnus") {
    if (a === undefined) return { name: "new-chat", context: new URLSearchParams(search).get("context") }
    if (a === "chat" && b !== undefined) return { name: "chat", chatId: b }
    if (a === "logboek" && b === undefined) return { name: "log" }
    if (a === "agents") return b === undefined ? { name: "agents" } : { name: "agent", agentId: b }
  }
  if (section === "analyse") return { name: "board", boardId: a ?? null }
  if (section === "live" && a === undefined) return { name: "live" }
  // `/v2/onderdelen` was the first components sheet; it is the kit now.
  if ((section === "kit" || section === "onderdelen") && a === undefined) return { name: "parts" }
  if (section === "merk" && a === undefined) return { name: "brand" }
  if (section === "meer" && a === undefined) return { name: "more" }
  const joined = parts.join("/")
  const hit = AREA_PREFIXES.find(({ prefix }) => joined === prefix || joined.startsWith(`${prefix}/`))
  if (hit !== undefined) {
    return {
      name: "area",
      area: hit.area,
      base: hit.prefix,
      path: parts.slice(hit.prefix.split("/").length),
      search,
      section: hit.section,
      layout: hit.layout
    }
  }
  // Magnus's own settings are the AI pages of Instellingen.
  if (section === "magnus" && a === "instellingen") {
    return {
      name: "area",
      area: "settings",
      base: "instellingen",
      path: ["ai", ...parts.slice(2)],
      search,
      section: "instellingen",
      layout: "shell"
    }
  }
  return { name: "soon", section, page: a ?? null }
}

/* ── location as an external store ────────────────────────────────────────────────────────────── */

const CHANGE = "v2:navigate"

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange)
  window.addEventListener(CHANGE, onChange)
  return () => {
    window.removeEventListener("popstate", onChange)
    window.removeEventListener(CHANGE, onChange)
  }
}

const snapshot = () => window.location.pathname + window.location.search

export function navigate(to: string) {
  if (to === snapshot()) return
  window.history.pushState(null, "", to)
  window.dispatchEvent(new Event(CHANGE))
  window.scrollTo({ top: 0 })
}

/** The current route and the raw pathname (for "is this link the current page"). */
export function useRoute(): { readonly route: Route; readonly pathname: string } {
  const href = useSyncExternalStore(subscribe, snapshot)
  const url = new URL(href, window.location.origin)
  return { route: matchRoute(url.pathname, url.search), pathname: url.pathname }
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { readonly to: string }

/** An `<a>` that navigates in place on a plain click and behaves like a link for everything else. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handle} {...rest} />
}

/**
 * Change the query of the current address in place (a filter, a tab, an open sheet), without a new
 * history entry and without scrolling: `setQuery({ status: "vertraagd", pagina: null })`.
 */
export function setQuery(next: Readonly<Record<string, string | null>>) {
  const url = new URL(window.location.href)
  for (const [key, value] of Object.entries(next)) {
    if (value === null) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  const to = url.pathname + url.search + url.hash
  if (to === snapshot()) return
  window.history.replaceState(null, "", to)
  window.dispatchEvent(new Event(CHANGE))
}

/** One value of the current query, kept in step with `setQuery` and the back button. */
export function useQuery(key: string): string | null {
  const href = useSyncExternalStore(subscribe, snapshot)
  return new URL(href, window.location.origin).searchParams.get(key)
}
