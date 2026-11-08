import { Context, type Effect, type Redacted, Schema } from "effect"

/*
 * Sealed secrets (integrations.md §1.2): an external account's tokens, encrypted before they reach the database, as a
 * port. The API Worker's adapter is an AES-256-GCM keyring from `SEAL_KEYS`, newest key first; the sealed text names
 * the key it was sealed with, so rotating means adding a key at the front and re-sealing.
 */

/** A sealed text that does not open: tampered with, or sealed with a key no longer in the ring. */
export class SealBroken extends Schema.TaggedError<SealBroken>()("SealBroken", { kid: Schema.String }) {}

export class Sealer extends Context.Service<Sealer, {
  readonly seal: (plain: string) => Effect.Effect<{ readonly sealed: string; readonly kid: string }>
  readonly open: (sealed: string) => Effect.Effect<Redacted.Redacted<string>, SealBroken>
}>()("shared/Sealer") {}
