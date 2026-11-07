/*
 * What a person in the workspace may see and do, as one catalogue the roles page, the gates around
 * the console, the invite dialog and API keys all read.
 *
 * A permission is an AREA held at a LEVEL — Geen, Bekijken, Bewerken, Beheren — plus a handful of
 * SPECIAL ACTIONS that are worth naming on their own because money or trust leaves the building
 * when they are used: refunding, submitting chargeback evidence, exporting, merging customers,
 * publishing a flow, reading invoices. A role also says which STORES it reaches.
 *
 * The ids line up with the rights an automation's service account holds (`components/automations/
 * scopes.ts`) wherever the two speak about the same thing: `orders.read` is "Bestellingen ·
 * Bekijken", `orders.write` is "Bestellingen · Bewerken", `refunds.write` is the refund action and
 * `disputes.write` the chargeback one. An API key with custom scopes is written in the same ids.
 */

export type Level = 0 | 1 | 2 | 3
export const LEVELS: ReadonlyArray<{ level: Level; label: string; short: string }> = [
  { level: 0, label: "Geen", short: "Geen" },
  { level: 1, label: "Bekijken", short: "Bekijken" },
  { level: 2, label: "Bewerken", short: "Bewerken" },
  { level: 3, label: "Beheren", short: "Beheren" }
]
export const levelLabel = (l: Level) => LEVELS[l]!.label

export const AREA_IDS = [
  "orders",
  "returns",
  "customers",
  "products",
  "support",
  "chargebacks",
  "suppliers",
  "affiliates",
  "automations",
  "analytics",
  "data",
  "settings",
  "team",
  "billing",
  "integrations"
] as const
export type AreaId = (typeof AREA_IDS)[number]

export type Area = {
  id: AreaId
  label: string
  /** The levels that mean something here. Analyse is read or nothing; Facturatie has no "edit". */
  levels: ReadonlyArray<Level>
  /** What each level lets someone do, as the clause after "kan". Index by level. */
  can: Partial<Record<Level, string>>
  /** Whether an API key can be given this area (team and billing are people-only). */
  api: boolean
}

export const AREAS: ReadonlyArray<Area> = [
  {
    id: "orders",
    label: "Bestellingen",
    levels: [0, 1, 2, 3],
    can: {
      1: "bestellingen bekijken",
      2: "bestellingen bewerken, labelen en annuleren",
      3: "bestellingen beheren, ook verwijderen en voor anderen aanmaken"
    },
    api: true
  },
  {
    id: "returns",
    label: "Retouren",
    levels: [0, 1, 2, 3],
    can: {
      1: "retouren en claims zien",
      2: "retouren behandelen, labels versturen en ontvangst melden",
      3: "retouren beheren, ook termijnen, regels en het retourportaal"
    },
    api: true
  },
  {
    id: "customers",
    label: "Klanten",
    levels: [0, 1, 2, 3],
    can: {
      1: "klantprofielen bekijken",
      2: "klanten bewerken en labelen",
      3: "klanten beheren, ook blokkeren en verwijderen"
    },
    api: true
  },
  {
    id: "products",
    label: "Producten",
    levels: [0, 1, 2, 3],
    can: {
      1: "de catalogus bekijken",
      2: "producten, prijzen en voorraad bewerken",
      3: "producten beheren, ook archiveren en verwijderen"
    },
    api: true
  },
  {
    id: "support",
    label: "Klantenservice",
    levels: [0, 1, 2, 3],
    can: {
      1: "tickets, inbox en chats lezen",
      2: "tickets beantwoorden, toewijzen en sluiten",
      3: "klantenservice beheren, ook mailboxen en verwijderen"
    },
    api: true
  },
  {
    id: "chargebacks",
    label: "Chargebacks",
    levels: [0, 1, 2, 3],
    can: {
      1: "geschillen en hun deadlines zien",
      2: "bewijspakketten opstellen",
      3: "chargebacks beheren, ook accepteren of laten vallen"
    },
    api: true
  },
  {
    id: "suppliers",
    label: "Leveranciers",
    levels: [0, 1, 2, 3],
    can: {
      1: "leveranciers en hun prestaties zien",
      2: "leveranciers berichten en bijwerken",
      3: "leveranciers beheren, ook het portaal openzetten"
    },
    api: true
  },
  {
    id: "affiliates",
    label: "Affiliates",
    levels: [0, 1, 2, 3],
    can: {
      1: "het affiliateprogramma zien",
      2: "aanmeldingen beoordelen en affiliates bijwerken",
      3: "het programma beheren, ook uitbetalingen goedkeuren"
    },
    api: true
  },
  {
    id: "automations",
    label: "Automatiseringen",
    levels: [0, 1, 2, 3],
    can: {
      1: "flows en hun uitvoeringen zien",
      2: "flows bouwen als concept",
      3: "automatiseringen beheren, ook aanzetten en verwijderen"
    },
    api: true
  },
  {
    id: "analytics",
    label: "Analyse",
    levels: [0, 1],
    can: { 1: "omzet, marge en rapporten bekijken" },
    api: true
  },
  {
    id: "data",
    label: "Data en export",
    levels: [0, 1, 2, 3],
    can: {
      1: "het werkblad en de synchronisatie zien",
      2: "importeren en het werkblad bewerken",
      3: "data beheren, ook in bulk verwijderen"
    },
    api: true
  },
  {
    id: "settings",
    label: "Instellingen",
    levels: [0, 1, 2, 3],
    can: {
      1: "winkel-, regio- en beveiligingsinstellingen lezen",
      2: "instellingen wijzigen",
      3: "instellingen beheren, ook winkels koppelen en ontkoppelen"
    },
    api: false
  },
  {
    id: "team",
    label: "Team en rollen",
    levels: [0, 1, 2, 3],
    can: {
      1: "zien wie er in het team zit",
      2: "collega's uitnodigen",
      3: "team en rollen beheren, ook rollen wijzigen en mensen verwijderen"
    },
    api: false
  },
  {
    id: "billing",
    label: "Facturatie",
    levels: [0, 1, 3],
    can: { 1: "het abonnement en de plekken zien", 3: "facturatie beheren, ook het abonnement en de betaalmethode" },
    api: false
  },
  {
    id: "integrations",
    label: "Koppelingen en API",
    levels: [0, 1, 2, 3],
    can: {
      1: "koppelingen, sleutels en webhooks zien",
      2: "koppelingen en webhooks instellen",
      3: "API-sleutels aanmaken, roteren en intrekken"
    },
    api: false
  }
]

export const AREA_BY_ID: Record<AreaId, Area> = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<AreaId, Area>

export const SPECIAL_IDS = [
  "refunds.write",
  "disputes.write",
  "data.export",
  "customers.merge",
  "automations.publish",
  "billing.invoices",
  "ai.autonomy",
  "returns.approve",
  "quality.approve",
  "products.phase"
] as const
export type SpecialId = (typeof SPECIAL_IDS)[number]

export type Special = {
  id: SpecialId
  label: string
  detail: string
  /** The area level it only makes sense beside. Without it the switch is off and says why. */
  needs: { area: AreaId; level: Level }
}

export const SPECIALS: ReadonlyArray<Special> = [
  {
    id: "refunds.write",
    label: "Terugbetalen",
    detail: "Geld teruggeven op een bestelling, tot het bedrag hieronder.",
    needs: { area: "orders", level: 2 }
  },
  {
    id: "disputes.write",
    label: "Chargeback-bewijs indienen",
    detail: "Een bewijspakket naar Stripe, Klarna of PayPal sturen. Dat kan niet terug.",
    needs: { area: "chargebacks", level: 2 }
  },
  {
    id: "data.export",
    label: "Exporteren",
    detail: "Bestellingen, klanten en producten als CSV downloaden.",
    needs: { area: "data", level: 1 }
  },
  {
    id: "customers.merge",
    label: "Klanten samenvoegen",
    detail: "Dubbele profielen tot één klant maken, met hun bestellingen en tickets.",
    needs: { area: "customers", level: 2 }
  },
  {
    id: "automations.publish",
    label: "Automatiseringen publiceren",
    detail: "Een flow live zetten, zodat hij uit naam van de werkruimte handelt.",
    needs: { area: "automations", level: 2 }
  },
  {
    id: "billing.invoices",
    label: "Facturen bekijken",
    detail: "Facturen van Insyte openen en downloaden.",
    needs: { area: "billing", level: 1 }
  },
  {
    id: "returns.approve",
    label: "Retouren goedkeuren",
    detail: "Een retour of claim goedkeuren of afwijzen. Terugbetalen blijft aan de terugbetaallimiet gebonden.",
    needs: { area: "returns", level: 2 }
  },
  {
    id: "quality.approve",
    label: "Kwaliteit goedkeuren",
    detail: "Een kwaliteitscontrole van een leverancier goedkeuren of afkeuren.",
    needs: { area: "products", level: 2 }
  },
  {
    id: "products.phase",
    label: "Productfase wijzigen",
    detail: "Een product op Test, Actief, Onder toezicht of Uitgefaseerd zetten.",
    needs: { area: "products", level: 2 }
  },
  {
    id: "ai.autonomy",
    label: "Zelfstandigheid van Insyte instellen",
    detail: "Bepalen wat de Insyte-agent zelf mag doen, wat hij eerst vraagt, en het AI-budget.",
    needs: { area: "settings", level: 3 }
  }
]

export const SPECIAL_BY_ID: Record<SpecialId, Special> = Object.fromEntries(SPECIALS.map((s) => [s.id, s])) as Record<
  SpecialId,
  Special
>

/** Store scope: every store (also the ones connected later), or a pick. */
export type StoreScope = "all" | string[]

export type Permissions = {
  levels: Record<AreaId, Level>
  specials: Record<SpecialId, boolean>
  /** The most one refund may be, in euros; `null` is no limit. Read only when refunding is on. */
  refundLimit: number | null
  stores: StoreScope
}

export type RoleDef = Permissions & {
  id: string
  label: string
  /** One of the five roles every workspace has. They can be changed (not the owner) and put back. */
  system?: boolean
  /** Made by the team. Only these can be renamed and deleted. */
  custom?: boolean
  /** The role it was made from, for the diff the editor shows. */
  basedOn?: string
  description?: string
  createdAt?: number
}

/* ── building roles ──────────────────────────────────────────────────────────────────────────── */

const ALL_AREAS = AREAS.map((a) => a.id)

/** The highest level an area offers at or below `want`. Facturatie has no Bewerken, so 2 becomes 1. */
export function clampLevel(area: AreaId, want: Level): Level {
  const levels = AREA_BY_ID[area].levels
  let best: Level = 0
  for (const l of levels) if (l <= want) best = l
  return best
}

export function makePermissions(
  levels: Partial<Record<AreaId, Level>>,
  specials: ReadonlyArray<SpecialId> = [],
  refundLimit: number | null = null,
  stores: StoreScope = "all"
): Permissions {
  return {
    levels: Object.fromEntries(ALL_AREAS.map((a) => [a, clampLevel(a, levels[a] ?? 0)])) as Record<AreaId, Level>,
    specials: Object.fromEntries(SPECIALS.map((s) => [s.id, specials.includes(s.id)])) as Record<SpecialId, boolean>,
    refundLimit,
    stores
  }
}

const every = (l: Level) => Object.fromEntries(ALL_AREAS.map((a) => [a, l])) as Record<AreaId, Level>
const ALL_SPECIALS = SPECIALS.map((s) => s.id)

/** The five roles a workspace starts with, as they come out of the box. "Standaard herstellen" puts these back. */
export const SYSTEM_DEFAULTS: Record<string, RoleDef> = {
  owner: {
    id: "owner",
    label: "Eigenaar",
    system: true,
    description: "Alles, altijd. Er is er één, en alleen die kan de werkruimte overdragen of verwijderen.",
    ...makePermissions(every(3), ALL_SPECIALS)
  },
  admin: {
    id: "admin",
    label: "Beheerder",
    system: true,
    description: "Alles behalve het abonnement en de betaalmethode.",
    ...makePermissions({ ...every(3), billing: 1 }, ALL_SPECIALS)
  },
  service: {
    id: "service",
    label: "Klantenservice",
    system: true,
    description: "Tickets, inbox en chats, met de bestellingen en klanten erachter.",
    ...makePermissions(
      {
        orders: 2,
        returns: 2,
        customers: 2,
        products: 1,
        support: 3,
        chargebacks: 2,
        suppliers: 1,
        automations: 1,
        team: 1
      },
      ["refunds.write", "disputes.write", "returns.approve"],
      100
    )
  },
  finance: {
    id: "finance",
    label: "Financiën",
    system: true,
    description: "Geld: terugbetalingen, chargebacks, analyse en facturatie.",
    ...makePermissions(
      {
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
        team: 1
      },
      ["refunds.write", "disputes.write", "data.export", "billing.invoices"]
    )
  },
  view: {
    id: "view",
    label: "Alleen lezen",
    system: true,
    description: "Ziet wat er gebeurt en verandert niets.",
    ...makePermissions({
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
      integrations: 1
    })
  }
}

export const SYSTEM_ORDER = ["owner", "admin", "service", "finance", "view"]

/* ── asking ──────────────────────────────────────────────────────────────────────────────────── */

export type Permission = AreaId | SpecialId
export const isSpecial = (p: Permission): p is SpecialId => p in SPECIAL_BY_ID

/**
 * Whether a role may do something. An area is asked at a level (`can(role, "orders", 2)`); a special
 * action is asked plain, and refunding takes the amount (`can(role, "refunds.write", 180)`), which
 * the role's limit has to cover. The owner can always do everything.
 */
export function canRole(role: Permissions & { id?: string }, perm: Permission, arg?: Level | number): boolean {
  if (role.id === "owner") return true
  if (isSpecial(perm)) {
    const s = SPECIAL_BY_ID[perm]
    if (!role.specials[perm] || role.levels[s.needs.area] < s.needs.level) return false
    if (perm === "refunds.write" && typeof arg === "number" && role.refundLimit !== null) return arg <= role.refundLimit
    return true
  }
  return role.levels[perm] >= ((arg as Level | undefined) ?? 1)
}

/* ── which part of the console a path belongs to ────────────────────────────────────────────── */

/** Path prefixes and the area level opening them needs. Longest prefix wins; anything unlisted is open. */
const ROUTE_AREAS: ReadonlyArray<readonly [string, AreaId, Level]> = [
  ["/orders", "orders", 1],
  ["/returns", "returns", 1],
  ["/settings/returns", "returns", 1],
  ["/customers", "customers", 1],
  ["/products", "products", 1],
  ["/suppliers", "suppliers", 1],
  ["/tickets", "support", 1],
  ["/inbox", "support", 1],
  ["/chats", "support", 1],
  ["/chargebacks", "chargebacks", 1],
  ["/automations", "automations", 1],
  ["/analytics", "analytics", 1],
  ["/data", "data", 1],
  ["/affiliates", "affiliates", 1],
  ["/settings/team", "team", 1],
  ["/settings/roles", "team", 1],
  ["/settings/billing", "billing", 1],
  ["/settings/integrations", "integrations", 1],
  ["/settings/apps", "integrations", 1],
  ["/settings/api-keys", "integrations", 1],
  ["/settings/webhooks", "integrations", 1],
  ["/settings/agents", "integrations", 1],
  ["/settings/stores", "settings", 1],
  ["/settings/ai/knowledge", "settings", 1],
  ["/settings/regional", "settings", 1],
  ["/settings/security", "settings", 1]
]

export function areaForPath(pathname: string): { area: AreaId; level: Level } | null {
  let best: (typeof ROUTE_AREAS)[number] | null = null
  for (const r of ROUTE_AREAS) {
    if ((pathname === r[0] || pathname.startsWith(`${r[0]}/`)) && (!best || r[0].length > best[0].length)) best = r
  }
  return best ? { area: best[1], level: best[2] } : null
}

/** The level a settings page needs before its fields can be changed, where it is not the page's own. */
export function editLevelForPath(pathname: string): { area: AreaId; level: Level } | null {
  // The Insyte AI pages are read by the whole team and changed with the ai.autonomy special, which
  // they gate themselves.
  if (pathname.startsWith("/settings/ai/")) return null
  // Termijnen, regels and the portal shape what every shopper is told: Beheren, not Bewerken.
  if (pathname === "/settings/returns") return { area: "returns", level: 3 }
  const open = areaForPath(pathname)
  if (!open) return null
  return { area: open.area, level: open.area === "billing" ? 3 : 2 }
}

export function canOpen(role: Permissions & { id?: string }, pathname: string): boolean {
  const need = areaForPath(pathname)
  return need ? canRole(role, need.area, need.level) : true
}

/* ── API scopes, in the automation's ids ─────────────────────────────────────────────────────── */

export type ApiAccess = 0 | 1 | 2
export const API_AREAS = AREAS.filter((a) => a.api)

/** `{ orders: 2, customers: 1 }` → ["orders.read", "orders.write", "customers.read"]. */
export function scopesOf(access: Partial<Record<AreaId, ApiAccess>>): string[] {
  return API_AREAS.flatMap((a) => {
    const v = access[a.id] ?? 0
    return v === 0 ? [] : v === 1 ? [`${a.id}.read`] : [`${a.id}.read`, `${a.id}.write`]
  })
}

/** What a role means for a key: its levels read as read (1) or read and write (2 and up). */
export function apiAccessOfRole(role: Permissions): Partial<Record<AreaId, ApiAccess>> {
  return Object.fromEntries(API_AREAS.map((a) => [a.id, Math.min(2, role.levels[a.id]) as ApiAccess]))
}
