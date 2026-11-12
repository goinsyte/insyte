import {
  type AppBadge,
  type AppCategory,
  type AppKind,
  CATALOG,
  CATALOG_BY_ID,
  COLLECTIONS
} from "@insyte/domain/Marketplace"
import { Bot, type IconComponent, Mail, Package, Plug, Settings, ShoppingBag, Star, Truck, Zap } from "../../icons"

/*
 * The catalogue as the screens read it. The apps themselves (names, copy, scopes, how each installs) are
 * `@insyte/domain/Marketplace`, the one source the server installs from too; what is only drawn (a kind's colours, the
 * labels, the icons) is here.
 */

export type { AppBadge, AppCategory, AppKind }

export const KIND_STYLE: Record<AppKind, { bg: string; text: string }> = {
  Integration: { bg: "var(--arc-tint)", text: "var(--arc-ink)" },
  App: { bg: "var(--arc-tint)", text: "var(--arc-ink)" },
  Coaching: { bg: "var(--signal-amber-bg)", text: "var(--signal-amber)" },
  Agency: { bg: "var(--signal-green-bg)", text: "var(--signal-green)" }
}

/** The kind as the operator reads it. */
export const KIND_LABEL: Record<AppKind, string> = {
  Integration: "Koppeling",
  App: "App",
  Coaching: "Coaching",
  Agency: "Bureau"
}

export const CATEGORY_LABEL: Record<AppCategory, string> = {
  ecommerce: "E-commerce",
  marketing: "Marketing",
  customer_service: "Klantenservice",
  analytics: "Analyse",
  finance: "Financiën",
  logistics: "Logistiek",
  ai: "AI en automatisering",
  communication: "Communicatie",
  integrations: "Koppelingen",
  productivity: "Productiviteit"
}

export const CATEGORIES_ORDER: AppCategory[] = [
  "ecommerce",
  "marketing",
  "customer_service",
  "analytics",
  "finance",
  "logistics",
  "ai",
  "communication",
  "integrations",
  "productivity"
]

export const BADGE_LABEL: Record<AppBadge, string> = {
  editors_choice: "Keuze van de redactie",
  best_seller: "Bestseller",
  new: "Nieuw",
  trending: "Populair"
}

const byApp = <A>(pick: (app: (typeof CATALOG)[number]) => A | undefined): Record<string, A> =>
  Object.fromEntries(CATALOG.flatMap((app) => {
    const value = pick(app)
    return value === undefined ? [] : [[app.id, value]]
  }))

export const KIND_FOR: Record<string, AppKind> = byApp((a) => a.kind)

export const CATEGORY_FOR: Record<string, AppCategory> = byApp((a) => a.category)

export const BADGE_FOR: Record<string, AppBadge> = byApp((a) => a.badge)

export const FEATURED_IDS: Array<string> = [...COLLECTIONS.featured]

export const TRENDING_IDS: Array<string> = [...COLLECTIONS.trending]

export const EDITORS_CHOICE_IDS: Array<string> = [...COLLECTIONS.editors]

export const ICON_FOR: Record<string, IconComponent> = {
  ext_klaviyo: Mail,
  ext_recharge: Zap,
  ext_yotpo: Star,
  ext_shipbob: Truck,
  ext_gorgias: Bot,
  ext_signifyd: Settings,
  ext_aftership: Truck,
  ext_loop: Package,
  ext_okendo: Star,
  ext_postscript: Mail,
  ext_zapier: Plug,
  ext_googleads: ShoppingBag
}

export const VENDOR_URL: Record<string, string> = byApp((a) => a.vendorUrl)

export const PRICING_FOR: Record<string, string> = byApp((a) => a.pricing)

export const FEATURES_FOR: Record<string, Array<string>> = byApp((a) => [...a.features])

export const PERMISSIONS_FOR: Record<string, Array<string>> = byApp((a) => a.scopes.map((s) => s.label))

/** A scope's label → its id, as the server stores what is taken back. */
export const scopeIdsOf = (appId: string, labels: ReadonlyArray<string>) =>
  (CATALOG_BY_ID[appId]?.scopes ?? []).filter((s) => labels.includes(s.label)).map((s) => s.id)

/** A scope's id → the label the detail lists. */
export const scopeLabelsOf = (appId: string, ids: ReadonlyArray<string>) =>
  (CATALOG_BY_ID[appId]?.scopes ?? []).filter((s) => ids.includes(s.id)).map((s) => s.label)

export function vendorName(name: string) {
  return name.replace(/ Pro$| Plus$/, "")
}

export function formatInstalls(n: number) {
  if (n >= 1000) return `${(Math.round(n / 100) / 10).toLocaleString("nl-NL")}k+ installaties`
  return `${n} ${n === 1 ? "installatie" : "installaties"}`
}
