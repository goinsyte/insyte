import { Context, type Effect } from "effect"

/*
 * The API keys' secret, as a port (16 §3): the HMAC that is stored, under a key the API Worker derives from its own
 * secret, so the hash proves the secret without the database ever holding anything that would.
 */
export class KeyHasher extends Context.Service<KeyHasher, {
  /** Hex of HMAC(derived key, secret). */
  readonly hash: (secret: string) => Effect.Effect<string>
}>()("developer/KeyHasher") {}
