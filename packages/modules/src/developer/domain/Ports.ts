import { Context, type Effect, Schema } from "effect"

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

/** The resolver did not answer (no response, an error status, or a DNS failure on its side): ours, not the endpoint's. */
export class ResolverUnavailable extends Schema.TaggedError<ResolverUnavailable>()("ResolverUnavailable", {
  host: Schema.String
}) {}

/**
 * Posting a delivery to an operator's endpoint (M19.4), as a port: the API Worker's adapter is `fetch` with a 10-second
 * time-out and redirects left unfollowed; the worker tests answer from the URL. `resolve` gives the addresses a name
 * points at (none for a name that does not exist), so an attempt can refuse a private one before it connects.
 */
export class WebhookSender extends Context.Service<WebhookSender, {
  readonly resolve: (host: string) => Effect.Effect<ReadonlyArray<string>, ResolverUnavailable>
  readonly post: (request: {
    readonly url: string
    readonly headers: Readonly<Record<string, string>>
    readonly body: string
  }) => Effect.Effect<PostResult>
}>()("developer/WebhookSender") {}

/**
 * Starting a delivery's attempts (M19.4): one durable run per delivery and run number (`runs`), named by both, so a
 * delivery handed over twice sends once, and a re-armed one gets a run of its own. The run sleeps out the retry
 * schedule between attempts. Answers whether the run is there (started now, or already); a `false` is left to the
 * minute sweep, which re-arms what never started.
 */
export class WebhookRuns extends Context.Service<WebhookRuns, {
  readonly start: (
    input: { readonly workspaceId: string; readonly deliveryId: string; readonly run: number }
  ) => Effect.Effect<boolean>
}>()("developer/WebhookRuns") {}
