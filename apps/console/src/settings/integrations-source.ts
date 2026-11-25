import type { ChannelStatus } from "@insyte/modules/inbox/domain/Chat"
import type { ConnectionList, ConnectionRow } from "@insyte/modules/stores/domain/Connections"
import type { IntegrationItem, IntegrationsSource } from "@insyte/ui/app/settings/integrations-source"

/*
 * Koppelingen in the console (M6, widgets/05 §5.1): `Connections.list` in the design's rows. The page reads only; each
 * row's button opens the page that manages it, so connecting, syncing and letting go happen in one place each:
 *
 * - a Shopify store at Winkels; the sending domain at E-mail en domein;
 * - Klaviyo under Apps (installed from the Marketplace); Slack at Meldingen; Insyte AI at Limieten.
 *
 * What the design shows and Insyte does not connect yet says Binnenkort: Stripe, Klarna and PayPal (M13.2), Gmail and
 * Outlook (M11 step 1b), Meta Ads and Google Ads (M13.5), and WhatsApp and Instagram (M15). So does Insyte AI on a
 * stage that has not switched it on, and the website chat on one without its key: nothing the operator can do turns
 * them on. The website chat (M15 step 8) connects here, in the console's own dialog (`./webchat.tsx`), each connected
 * store with its own row whose Beheren opens it (`?chat=`). So does a connected mailbox's (`?mailbox=`, `./mailbox.tsx`):
 * its forwarding address, signature and Ontkoppelen; one to connect opens the inbox's own dialog.
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

/** `readsSupport`: the viewer's role reads Klantenservice, without which a mailbox's manage view and the inbox refuse. */
const itemOf = (row: Row, readsSupport: boolean): IntegrationItem => {
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
        ...(!readsSupport
          ? {}
          : row.status === "disconnected"
          ? { manage: { to: "/inbox", search: { connect: "mailbox" } } }
          : { manage: { to: "/settings/integrations", search: { mailbox: row.id } } })
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
        // Connected, it is managed under Apps; else Koppelen opens Klaviyo's detail in the Marketplace, over this page.
        ...(row.status === "connected" ? { manage: { to: "/settings/apps" } } : { app: "ext_klaviyo" })
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

const WEBCHAT = { name: "Websitechat", category: "Channels", brand: "webchat" } as const

/**
 * The website chat's rows: each store that has it, and "Koppelen" for one more while a store is without; Binnenkort
 * where the stage has no key for it, or the role may not read it.
 */
const webchatOf = (chat: ChannelStatus | undefined, stores: number): ReadonlyArray<IntegrationItem> => {
  if (chat === undefined || !chat.available) {
    return [{ key: "webchat", ...WEBCHAT, description: "Een chatvenster op je winkel", status: "soon" }]
  }
  const on = chat.channels.filter((c) => c.status === "connected")
  return [
    ...on.map((c): IntegrationItem => ({
      key: `webchat:${c.id}`,
      ...WEBCHAT,
      description: `Een chatvenster op ${c.storeName}`,
      status: "connected",
      // On, but Shopify was not told where the embed loads the widget from: the storefront shows nothing yet.
      ...(c.themeUpdated ? {} : { attention: "Chat staat aan, maar je thema kon niet worden bijgewerkt" }),
      manage: { to: "/settings/integrations", search: { chat: c.id } }
    })),
    ...(on.length === 0 || on.length < stores
      ? [{ key: "webchat", ...WEBCHAT, description: "Een chatvenster op je winkel", status: "disconnected" as const }]
      : [])
  ]
}

/**
 * The design's rows: what the server knows, then what is not built yet, then the website chat (the page groups them by
 * category, so it stays last of Kanalen, as the design lists it).
 */
const integrationsOf = (
  list: ConnectionList,
  chat: ChannelStatus | undefined,
  stores: number,
  readsSupport: boolean
): ReadonlyArray<IntegrationItem> => [
  ...list.connections.map((row) => itemOf(row, readsSupport)),
  ...SOON,
  ...webchatOf(chat, stores)
]

export const consoleIntegrationsSource = (
  list: ConnectionList,
  chat?: ChannelStatus | undefined,
  stores = 1,
  readsSupport = true
): IntegrationsSource => ({
  integrations: integrationsOf(list, chat, stores, readsSupport)
})
