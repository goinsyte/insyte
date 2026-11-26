import { statements } from "../statements.ts"

/*
 * A return's shopper mail that the provider could not take at its first try is tried again on an outbox event of its
 * own (`return.mail`), so the event that asked for it commits its other sinks (Shopify's write of the decision)
 * meanwhile. `return_mails.sent_at` is null exactly while a mail waits to go; it is set once the mail is settled: it
 * went, or it is not tried again (refused for its recipient, impossible to make, or past its last try), as the return's
 * history says. A row written before has its time, as it was settled then. Additive only: a write that leaves
 * `sent_at` out still has its default.
 */
export default statements("alter table return_mails alter column sent_at drop not null")
