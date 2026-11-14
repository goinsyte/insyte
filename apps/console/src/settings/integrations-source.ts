import type { ConnectionList, ConnectionRow } from "@insyte/modules/stores/domain/Connections"
import type { IntegrationItem, IntegrationsSource } from "@insyte/ui/app/settings/integrations-source"

/*
 * Koppelingen in the console (M6, widgets/05 §5.1): `Connections.list` in the design's rows. The page reads only; each
 * row's button opens the page that manages it, so connecting, syncing and letting go happen in one place each:
 *
 * - a Shopify store at Winkels; a mailbox in the inbox; the sending domain at E-mail en domein;
 * - Klaviyo under Apps (installed from the Marketplace); Slack at Meldingen; Insyte AI at Limieten.
 *
 * What the design shows and Insyte does not connect yet says Binnenkort: Stripe, Klarna and PayPal (M13.2), Gmail and
 * Outlook (M11 step 1b), Meta Ads and Google Ads (M13.5), and the chat channels (M15). So does Insyte AI on a stage
 * that has not switched it on: nothing the operator can do turns it on.
 */

type Row = typeof ConnectionRow.Type

/** Designed, not connected by Insyte yet. */
const SOON: ReadonlyArray<IntegrationItem> = [
  {
    key: "stripe",
    name: "Stripe",
    description: "Kaartbetalingen, terugbetalingen en geschillen",
    category: "Payments",
    status: "soon"
  },
  { key: "klarna", name: "Klarna", description: "Geschillen en betalingen", category: "Payments", status: "soon" },
  { key: "paypal", name: "PayPal", description: "Geschillen en betalingen", category: "Payments", status: "soon" },
  { key: "gmail", name: "Gmail", description: "Inbox en gesprekken", category: "Email", status: "soon" },
  { key: "outlook", name: "Outlook", description: "Inbox en gesprekken", category: "Email", status: "soon" },
  {
    key: "whatsapp",
    name: "WhatsApp Business",
    description: "Gesprekken met klanten",
    category: "Channels",
    status: "soon"
  },
  { key: "instagram", name: "Instagram", description: "Berichten en reacties", category: "Channels", status: "soon" },
  {
    key: "webchat",
    name: "Websitechat",
    description: "Een chatvenster op je winkel",
    category: "Channels",
    status: "soon"
  },
  {
    key: "meta",
    name: "Meta Ads",
    description: "Advertentiekosten en resultaten per campagne",
    category: "Marketing",
    status: "soon"
  },
  {
    key: "google-ads",
    name: "Google Ads",
    description: "Advertentiekosten en resultaten per campagne",
    category: "Marketing",
    status: "soon"
  }
]

/** What a Klaviyo or Slack connection that needs action needs. */
const ACCOUNT_ATTENTION: Record<string, string> = {
  revoked: "de toegang is ingetrokken, dus koppel opnieuw",
  token_expired: "de toegang is verlopen, dus koppel opnieuw",
  scope_missing: "Insyte mist rechten, dus koppel opnieuw"
}

const iso = (at: number | null) => (at === null ? {} : { syncedAt: new Date(at).toISOString() })

/** The module's sentence after the description's dot, without its own full stop. */
const after = (note: string) => note.replace(/\.$/, "")

const itemOf = (row: Row): IntegrationItem => {
  switch (row.provider) {
    case "shopify":
      return {
        key: `shopify:${row.id}`,
        brand: "shopify",
        name: row.account ?? "Shopify",
        description: "Bestellingen, producten en klanten",
        category: "Commerce",
        status: row.status,
        ...iso(row.lastSyncedAt),
        // A warning (a grant about to lapse, webhooks behind) is said beside Gekoppeld, in place of the last sync.
        ...(row.status === "action_required"
          ? { attention: row.note === null ? "koppel de winkel opnieuw" : after(row.note) }
          : row.note === null
          ? {}
          : { attention: after(row.note) }),
        manage: row.storeId === null
          ? { to: "/settings/stores" }
          : { to: "/settings/stores", search: { store: row.storeId } }
      }
    case "forward":
    case "gmail":
    case "outlook":
      return {
        key: `mailbox:${row.id}`,
        brand: row.provider === "forward" ? "email" : row.provider,
        name: row.account ?? "Doorgestuurde mailbox",
        description: row.account === null ? "Stuur je eigen supportadres door naar Insyte" : "Inbox en gesprekken",
        category: "Email",
        status: row.status,
        ...iso(row.lastSyncedAt),
        manage: row.status === "disconnected"
          ? { to: "/inbox", search: { connect: "mailbox" } }
          : { to: "/inbox", search: { mailbox: row.id } }
      }
    case "resend":
      return {
        key: "resend",
        brand: "email",
        name: row.account ?? "Eigen afzenderdomein",
        description: "Mail aan klanten vanaf je eigen domein",
        category: "Email",
        status: row.status,
        ...(row.status === "action_required"
          ? { attention: "de DNS-records zijn nog niet gevonden", action: "Controleren" }
          : row.status === "disconnected"
          ? { action: "Instellen" }
          : {}),
        manage: { to: "/settings/email-domain" }
      }
    case "klaviyo":
      return {
        key: "klaviyo",
        name: "Klaviyo",
        description: row.account === null ? "E-mail- en sms-campagnes" : `E-mail- en sms-campagnes · ${row.account}`,
        category: "Marketing",
        status: row.status,
        ...iso(row.lastSyncedAt),
        ...(row.reason !== null && ACCOUNT_ATTENTION[row.reason] !== undefined
          ? { attention: ACCOUNT_ATTENTION[row.reason]! }
          : {}),
        manage: row.status === "connected" ? { to: "/settings/apps" } : { to: "/marketplace" }
      }
    case "slack":
      return {
        key: "slack",
        name: "Slack",
        description: row.account === null ? "Meldingen in je Slack-kanalen" : `Meldingen in Slack · ${row.account}`,
        category: "Team",
        status: row.status,
        ...iso(row.lastSyncedAt),
        ...(row.reason !== null && ACCOUNT_ATTENTION[row.reason] !== undefined
          ? { attention: ACCOUNT_ATTENTION[row.reason]! }
          : {}),
        manage: { to: "/settings/notifications" }
      }
    case "anthropic":
      return {
        key: "anthropic",
        name: "Anthropic",
        description: "Claude, voor opgestelde antwoorden en voorstellen",
        category: "AI",
        status: row.status === "connected" ? "connected" : "soon",
        manage: { to: "/settings/ai/limits" }
      }
  }
}

/** The design's rows: what the server knows, then what is not built yet, in the design's place. */
const integrationsOf = (list: ConnectionList): ReadonlyArray<IntegrationItem> => [
  ...list.connections.map(itemOf),
  ...SOON
]

export const consoleIntegrationsSource = (list: ConnectionList): IntegrationsSource => ({
  integrations: integrationsOf(list)
})
