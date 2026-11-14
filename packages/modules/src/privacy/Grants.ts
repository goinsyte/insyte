import type { Db } from "@insyte/database/Db"
import type { CurrentWorkspace } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"

/*
 * What a workspace's deletion needs from the slices that hold its providers' grants (M17 step 5). A port of its own,
 * beside the slice's service rather than in its domain ring, because each provider's part reads its credentials.
 */

/** One provider's grant, given back as the workspace is deleted. */
export interface Released {
  readonly provider: "shopify" | "klaviyo" | "slack"
  /** Grants given back; a provider that refused is logged, and its token goes with the workspace either way. */
  readonly count: number
}

/**
 * The providers' grants given back at a workspace's deletion (M17 step 5), before Insyte forgets the tokens: the
 * Shopify app uninstalled from each shop, Klaviyo's refresh token and Slack's bot token revoked. Each provider's own
 * slice does its part; the platform puts them together (`links/ProviderGrants.ts`). Mailboxes connected by Google or
 * Microsoft OAuth would be here too; there are none yet (only forwarding addresses).
 */
export class ProviderGrants extends Context.Service<ProviderGrants, {
  readonly release: Effect.Effect<ReadonlyArray<Released>, never, Db | CurrentWorkspace>
}>()("privacy/ProviderGrants") {}
