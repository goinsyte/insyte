import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { type Mail, Mailer, type MailKind, type MailNotSent } from "../domain/Mailer.ts"
import { sendersFor } from "../domain/Senders.ts"

/*
 * The sender of a shopper's mail (M17 step 20.1c), read on the caller's transaction in its workspace's scope: the one
 * place a returns mail, a delay mail or an inbox message learns whether it goes from the brand's own domain. With
 * nothing set, or the domain not verified, it adds nothing and Insyte's sender stays.
 *
 * `sendToCustomer` sends it so. Should the provider refuse the brand's address all the same (the domain lapsed since it
 * was last checked: a DNS record taken off), the domain is marked not verified, so the next mail does not try it, and
 * this one goes again from Insyte's address: a stale flag never stops a shopper's mail.
 */
export const customerSender = Effect.fn("Senders.customerSender")(function*(
  sql: SqlClient.SqlClient,
  kind: MailKind
) {
  const rows = yield* sql<{ value: unknown }>`select value from workspace_settings where section = 'domain_senders'`
  return sendersFor(rows[0]?.value, kind)
})

/** The kept domain marked not verified, and due a read of the provider the next time the page is opened. */
const lapse = (sql: SqlClient.SqlClient) =>
  sql`update workspace_settings
      set value = jsonb_set(jsonb_set(value, '{domain,verified}', 'false'::jsonb), '{domain,readAt}', '0'::jsonb)
      where section = 'domain_senders' and jsonb_typeof(value -> 'domain') = 'object'`

/** What a try did: the brand's address it went, or did not go, from (`null`: Insyte's), and why it did not go. */
export interface Tried {
  readonly from: string | null
  readonly error: MailNotSent | null
}

/**
 * The mail sent as `sendToCustomer` sends it, answering which sender the last attempt used, for a try again to keep:
 * after the brand's address was refused and Insyte's did not go either, that is Insyte's. `from`: the sender a try
 * before used (`null`: Insyte's), so a try again is the same mail under the same idempotency key, whatever E-mail en
 * domein says by now; left out, as it says.
 */
export const trySendToCustomer = Effect.fn("Senders.trySendToCustomer")(function*(
  sql: SqlClient.SqlClient,
  mail: Mail,
  options?: { readonly from?: string | null | undefined }
) {
  const mailer = yield* Mailer
  const { from: now, ...rest } = yield* customerSender(sql, mail.kind)
  const from = options?.from === undefined ? now : options.from ?? undefined
  const senders = { ...rest, ...(from === undefined ? {} : { from }) }
  const sent = (m: Mail) =>
    mailer.send(m).pipe(Effect.as(null), Effect.catchTag("MailNotSent", (e) => Effect.succeed(e)))
  const first = yield* sent({ ...mail, ...senders })
  if (first === null || first.senderRefused !== true || from === undefined) {
    return { from: from ?? null, error: first } satisfies Tried
  }
  yield* Effect.logWarning("brand sender refused; sent from Insyte", { kind: mail.kind, reason: first.reason })
  yield* lapse(sql)
  const { from: _from, ...plain } = mail
  return { from: null, error: yield* sent({ ...plain, ...rest }) } satisfies Tried
})

export const sendToCustomer = Effect.fn("Senders.sendToCustomer")(function*(
  sql: SqlClient.SqlClient,
  mail: Mail,
  options?: { readonly from?: string | null | undefined }
) {
  const tried = yield* trySendToCustomer(sql, mail, options)
  if (tried.error !== null) return yield* tried.error
})
