import { statements } from "../statements.ts"

/*
 * A return's shopper mail that did not go at its first try is tried again on an outbox event of its own
 * (`return.mail`), so the event that asked for it commits its other sinks (Shopify's write of the decision) meanwhile.
 * Its `return_mails` row is then in line, not sent: `sent_at` is null until it went. A row written before has gone (or
 * was refused, as its history says). Additive only: a write that leaves `sent_at` out still has its default.
 */
export default statements("alter table return_mails alter column sent_at drop not null")
