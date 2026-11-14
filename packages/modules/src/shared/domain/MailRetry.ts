import { Schema } from "effect"

/*
 * A shopper's mail the provider could not take just then (busy, 429; out, 5xx or unreachable): it stays in line and is
 * tried again, one, two, four, eight minutes on, with the same idempotency key, so it goes once. After `MAX_ATTEMPTS`
 * it is kept as failed with why. The try again is an outbox event of its own, carrying which try it is and the sender
 * the first try went from (an address, the one exception to ids and enums in a payload): E-mail en domein changed in
 * between, a new sender would be a new key, and the shopper could have it twice.
 */

export const MAX_ATTEMPTS = 5
export const FIRST_RETRY_SECONDS = 60

/** What a try again carries: the how-manyth try it is, and the brand's address the first went from (`null`: Insyte's). */
export const RetryFields = {
  attempt: Schema.optional(Schema.Int),
  from: Schema.optional(Schema.NullOr(Schema.String))
}

/** Which try this is, and the sender the first went from: what a sink is handed from a try again's event. */
export interface MailTry {
  readonly attempt?: number | undefined
  readonly from?: string | null | undefined
}

/** Seconds until the next try, after try `attempt` did not go; none when it may not be tried again. */
export const retryAfter = (error: { readonly retryable?: boolean | undefined }, attempt: number) =>
  error.retryable === true && attempt < MAX_ATTEMPTS ? FIRST_RETRY_SECONDS * 2 ** (attempt - 1) : undefined
