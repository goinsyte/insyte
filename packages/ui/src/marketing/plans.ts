import type { Vendor } from "./parts.tsx"

/**
 * The plans, in one place. The landing page's pricing reads this file and nothing else.
 *
 * Pricing is an OPEN DECISION (PRODUCT.md, "Undecided, and not to be invented"; docs/PLAN.md, Open
 * decisions): the legacy landing showed €99 / €249 / €499, the console's billing screen still shows
 * placeholders, and the legacy billing package says Stripe's price is the source of truth. These are
 * the legacy landing's figures, carried over unchanged and labelled on the page as indicative. When
 * the decision is made, it is made here. Which capability sits in which plan is part of the same
 * indicative proposal.
 *
 * Every line, chip and comparison row is a capability the console has today (the file it lives in
 * is named beside each group below) or a limit of the plan. No service-level promises,
 * certifications or support times: none of those exist yet. SAML and OIDC are "Later" in
 * docs/backend/security.md, so they appear only as `soon`, never as included.
 */

export type Cycle = "monthly" | "yearly"

export type PlanId = "starter" | "growth" | "scale"

export type Plan = {
  readonly id: PlanId
  readonly name: string
  readonly pitch: string
  /** Euros per month, billed monthly. */
  readonly monthly: number
  /** Euros per month, billed yearly (two months free). */
  readonly yearly: number
  /** Limits; `null` is unlimited. */
  readonly stores: number | null
  readonly seats: number | null
  readonly orders: number | null
  /** What the plan adds over the one before it, as chips. `soon` is not built yet and says so. */
  readonly chips: ReadonlyArray<{ readonly label: string; readonly soon?: true }>
}

export const PLANS: ReadonlyArray<Plan> = [
  {
    id: "starter",
    name: "Starter",
    pitch: "Eén winkel, één operator.",
    monthly: 99,
    yearly: 83,
    stores: 1,
    seats: 1,
    orders: 2000,
    chips: [
      { label: "Shopify-koppeling" },
      { label: "Inbox voor Gmail en Outlook" },
      { label: "Concepten en voorstellen" },
      { label: "Bewijspakketten" },
      { label: "Tweestapsverificatie" },
      { label: "Inloggen met Google" }
    ]
  },
  {
    id: "growth",
    name: "Growth",
    pitch: "Tot vijf winkels en een klein team.",
    monthly: 249,
    yearly: 208,
    stores: 5,
    seats: 5,
    orders: 20000,
    chips: [
      { label: "Automatiseringen met AI-stappen" },
      { label: "Vraag Insyte" },
      { label: "Leveranciersportaal" },
      { label: "Partnerprogramma" },
      { label: "API-sleutels met scopes" },
      { label: "Webhooks" }
    ]
  },
  {
    id: "scale",
    name: "Scale",
    pitch: "Elke winkel en het hele team.",
    monthly: 499,
    yearly: 416,
    stores: null,
    seats: null,
    orders: null,
    chips: [
      { label: "Eigen rollen en rechten" },
      { label: "Terugbetaallimiet per rol" },
      { label: "Auditlog" },
      { label: "2FA verplichten" },
      { label: "Alleen Google Workspace" },
      { label: "SAML en OIDC", soon: true }
    ]
  }
]

/** The smallest plan that holds this many stores and orders a month. */
const fits = (limit: number | null, n: number) => limit === null || n <= limit

export function planFor(stores: number, orders: number): Plan {
  return PLANS.find((p) => fits(p.stores, stores) && fits(p.orders, orders)) ?? PLANS[PLANS.length - 1]!
}

/** A comparison cell: included, not included, a value, or not built yet. */
export type Cell = boolean | string | { readonly soon: true }

type Row = {
  readonly label: string
  readonly cells: readonly [Cell, Cell, Cell]
  /** For the integrations group: the services the row names, drawn with their own marks. */
  readonly vendors?: ReadonlyArray<Vendor>
}

export type Group = { readonly id: string; readonly title: string; readonly rows: ReadonlyArray<Row> }

const all: readonly [Cell, Cell, Cell] = [true, true, true]
const fromGrowth: readonly [Cell, Cell, Cell] = [false, true, true]
const scaleOnly: readonly [Cell, Cell, Cell] = [false, false, true]

export const COMPARISON: ReadonlyArray<Group> = [
  {
    // routes/_admin/orders, stores (settings/stores.tsx), dashboard live ticker
    id: "bestellingen",
    title: "Bestellingen",
    rows: [
      { label: "Winkels", cells: ["1", "Tot 5", "Onbeperkt"] },
      { label: "Bestellingen per maand", cells: ["Tot 2.000", "Tot 20.000", "Onbeperkt"] },
      { label: "Vertraagde bestellingen gemarkeerd", cells: all },
      { label: "Leverancier aansporen, als voorstel", cells: all },
      { label: "Opgeslagen weergaven en filters", cells: all }
    ]
  },
  {
    // routes/_admin/inbox, tickets, chats; ask.tsx
    id: "klantenservice",
    title: "Klantenservice",
    rows: [
      { label: "Gedeelde inbox en tickets", cells: all },
      { label: "Concepten in jouw toon, met bronnen", cells: all },
      { label: "Teamchats en vermeldingen", cells: fromGrowth },
      { label: "Vraag Insyte in elk paneel", cells: fromGrowth }
    ]
  },
  {
    // ADR-0027 and docs/PLAN.md Phase 4: designed, not built, and no plan tier decided, so binnenkort everywhere.
    id: "agent",
    title: "Insyte-agent",
    rows: [
      { label: "Zelfstandigheid per actie", cells: [{ soon: true }, { soon: true }, { soon: true }] },
      { label: "Logboek van de agent met Ongedaan maken", cells: [{ soon: true }, { soon: true }, { soon: true }] },
      { label: "Maandlimiet voor AI-gebruik", cells: [{ soon: true }, { soon: true }, { soon: true }] },
      { label: "Klantagent op de chat van je winkel", cells: [{ soon: true }, { soon: true }, { soon: true }] },
      { label: "MCP-server voor je eigen AI-tools", cells: [{ soon: true }, { soon: true }, { soon: true }] }
    ]
  },
  {
    // routes/_admin/chargebacks
    id: "chargebacks",
    title: "Chargebacks",
    rows: [
      { label: "Bewijspakket, samengesteld door Insyte", cells: all },
      { label: "Deadlines in de wachtrij en agenda", cells: all }
    ]
  },
  {
    // routes/_admin/automations; lib/automation-templates.ts
    id: "automatiseringen",
    title: "Automatiseringen",
    rows: [
      { label: "Sjablonen uit de bibliotheek", cells: fromGrowth },
      { label: "Bouwer met AI-stappen", cells: fromGrowth },
      { label: "Testen met een voorbeeldbestelling", cells: fromGrowth },
      { label: "Versies en uitvoeringen bewaard", cells: fromGrowth }
    ]
  },
  {
    // routes/_supplier, routes/_aff, mock-data/affiliate-program.ts
    id: "partners",
    title: "Leveranciers en partners",
    rows: [
      { label: "Leveranciers beheren", cells: all },
      { label: "Leveranciersportaal", cells: fromGrowth },
      { label: "Partnerprogramma met eigen portaal", cells: fromGrowth }
    ]
  },
  {
    // settings/team, roles, security, api-keys, webhooks; invitations.$invitationId.tsx
    id: "team",
    title: "Team en beveiliging",
    rows: [
      { label: "Plekken", cells: ["1", "5", "Onbeperkt"] },
      { label: "Tweestapsverificatie", cells: all },
      { label: "Inloggen met Google", cells: all },
      { label: "API-sleutels met scopes", cells: fromGrowth },
      { label: "Webhooks met bezorglog", cells: fromGrowth },
      { label: "Eigen rollen en rechten", cells: scaleOnly },
      { label: "Terugbetaallimiet per rol", cells: scaleOnly },
      { label: "Auditlog", cells: scaleOnly },
      { label: "2FA verplichten voor het team", cells: scaleOnly },
      { label: "Alleen inloggen via Google Workspace", cells: scaleOnly },
      { label: "SAML en OIDC", cells: [false, false, { soon: true }] }
    ]
  },
  {
    // stores/workspace-store.ts (integrations), mock-data/marketplace.ts, automation step vendors
    id: "koppelingen",
    title: "Koppelingen",
    rows: [
      { label: "Winkel", cells: all, vendors: ["shopify"] },
      { label: "E-mail", cells: all, vendors: ["gmail", "outlook"] },
      { label: "Betalingen en geschillen", cells: all, vendors: ["stripe", "klarna", "paypal"] },
      { label: "Tracking", cells: all, vendors: ["aftership"] },
      { label: "Marketing", cells: fromGrowth, vendors: ["klaviyo"] },
      { label: "Team", cells: fromGrowth, vendors: ["slack"] },
      { label: "Alles daarbuiten", cells: fromGrowth, vendors: ["zapier"] },
      // docs/backend/integrations.md marks these Later; the console shows them as Binnenkort.
      {
        label: "Vervoerders, boekhouding en meer",
        cells: [{ soon: true }, { soon: true }, { soon: true }],
        vendors: ["dhl", "postnl", "exact"]
      }
    ]
  }
]

/** "€ 249", the way nl-NL writes a whole euro amount. */
export const euros = (n: number): string =>
  n.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
