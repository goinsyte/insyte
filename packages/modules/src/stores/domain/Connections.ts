import { Schema } from "effect"

/*
 * Koppelingen (M6, widgets/05 §5.1): every external account the workspace has, read in one go and read only. The page
 * names each and says where it stands; connecting, syncing and letting go stay on the page that owns it (Winkels,
 * Meldingen, the inbox, E-mail en domein, Apps). Only status, names and times: never a token, a scope, a credential
 * or what the provider said about the account beyond its name.
 *
 * - `shopify`: one row per store the reader reaches (`storeScope`), with its sync health (`Health.ts`).
 * - `forward` (and later `gmail`, `outlook`): one row per connected mailbox. Mailboxes belong to the workspace, not to
 *   a store.
 * - `klaviyo`, `slack`, `resend` (the sending domain), `anthropic` (Insyte AI on this stage): one row each.
 *
 * A provider with nothing connected is one row of `status: "disconnected"` and `id` its own name, so the page can offer
 * the way to connect it.
 */

export const ConnectionProvider = Schema.Literals([
  "shopify",
  "forward",
  "gmail",
  "outlook",
  "resend",
  "klaviyo",
  "slack",
  "anthropic"
])
export type ConnectionProvider = typeof ConnectionProvider.Type

export const ConnectionStatus = Schema.Literals(["connected", "action_required", "connecting", "disconnected"])
export type ConnectionStatus = typeof ConnectionStatus.Type

export class ConnectionRow extends Schema.Class<ConnectionRow>("stores/ConnectionRow")({
  provider: ConnectionProvider,
  /** The row: a store's or a mailbox's id; the provider's name for one a workspace has once, or has none of. */
  id: Schema.String,
  /** The store a Shopify row is; `null` for everything else. */
  storeId: Schema.NullOr(Schema.String),
  /** What it is called: the store, the mailbox's address, the domain, the Klaviyo account, the Slack workspace. */
  account: Schema.NullOr(Schema.String),
  status: ConnectionStatus,
  /**
   * Why it needs attention, as a code: Shopify's worst open incident (`Health.ts`) or `action_required`; `revoked`,
   * `token_expired` or `scope_missing` for Klaviyo and Slack; `unverified` for a domain not seen verified yet; `off`
   * for Insyte AI not switched on on this stage. `null` when nothing is the matter.
   */
  reason: Schema.NullOr(Schema.String),
  /** The finding in a sentence where the module has one (a store's sync); `null` otherwise. */
  note: Schema.NullOr(Schema.String),
  /** When Insyte last read it through, epoch milliseconds; `null` when it never did or does not sync. */
  lastSyncedAt: Schema.NullOr(Schema.Finite)
}) {}

export class ConnectionList extends Schema.Class<ConnectionList>("stores/ConnectionList")({
  connections: Schema.Array(ConnectionRow)
}) {}

/** A Klaviyo or Slack connection's stored status in the page's terms, with the reason where it needs action. */
export const accountStatus = (
  status: string | undefined
): { readonly status: ConnectionStatus; readonly reason: string | null } => {
  switch (status) {
    case "connected":
    case "rate_limited":
      return { status: "connected", reason: null }
    case "connecting":
      return { status: "connecting", reason: null }
    case "revoked":
    case "token_expired":
    case "scope_missing":
      return { status: "action_required", reason: status }
    default:
      return { status: "disconnected", reason: null }
  }
}
