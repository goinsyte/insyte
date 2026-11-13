import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"

/* A refund's id for an order's refund (M7) and a return settled with one (M9): the same in Insyte and at Shopify. */

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz"

/**
 * The refund's id: from the caller's `Idempotency-Key` when there is one, so the same key is the same refund here and
 * Shopify's idempotency key there; a fresh one otherwise.
 */
export const refundIdOf = (key: string | undefined, principalId: string) =>
  key === undefined || key.trim() === ""
    ? Effect.succeed(mintId("rfd"))
    : Effect.map(
      Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${principalId}:${key}`))),
      (bytes) => `rfd_${[...new Uint8Array(bytes).slice(0, 26)].map((b) => CROCKFORD[b % 32]).join("")}`
    )
