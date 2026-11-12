import { Context, type Effect } from "effect"

/*
 * The API keys' secret, as a port (16 §3): the HMAC that is stored, under a key the API Worker derives from its own
 * secret, so the hash proves the secret without the database ever holding anything that would.
 */
export class KeyHasher extends Context.Service<KeyHasher, {
  /** Hex of HMAC(derived key, secret). */
  readonly hash: (secret: string) => Effect.Effect<string>
}>()("developer/KeyHasher") {}

/** What one attempt to post a delivery came back with. */
export interface PostResult {
  /** The HTTP status; `null` when nothing came back. */
  readonly status: number | null
  readonly ms: number
  /** Why there is no status (`timeout`, `network`), or `redirect` for a 3xx, which is never followed. */
  readonly error: string | null
  /** The start of the answer's body, at most 2 KB. */
  readonly body: string
}

/**
 * Posting a delivery to an operator's endpoint (M19.4), as a port: the API Worker's adapter is `fetch` with a 10-second
 * time-out and redirects left unfollowed; the worker tests answer from the URL. `resolve` gives the addresses a name
 * points at, so an attempt can refuse a private one before it connects.
 */
export class WebhookSender extends Context.Service<WebhookSender, {
  readonly resolve: (host: string) => Effect.Effect<ReadonlyArray<string>>
  readonly post: (request: {
    readonly url: string
    readonly headers: Readonly<Record<string, string>>
    readonly body: string
  }) => Effect.Effect<PostResult>
}>()("developer/WebhookSender") {}

/**
 * Starting a delivery's attempts (M19.4): one durable run per delivery, named by it, so a relay that hands it over twice
 * sends once. The run sleeps out the retry schedule between attempts.
 */
export class WebhookRuns extends Context.Service<WebhookRuns, {
  readonly start: (input: { readonly workspaceId: string; readonly deliveryId: string }) => Effect.Effect<void>
}>()("developer/WebhookRuns") {}
