import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { type Mail, Mailer, type MailKind } from "../domain/Mailer.ts"
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

export const sendToCustomer = Effect.fn("Senders.sendToCustomer")(function*(
  sql: SqlClient.SqlClient,
  mail: Mail
) {
  const mailer = yield* Mailer
  const senders = yield* customerSender(sql, mail.kind)
  const { from, ...rest } = senders
  return yield* mailer.send({ ...mail, ...senders }).pipe(
    Effect.catchTag("MailNotSent", (error) =>
      error.senderRefused !== true || from === undefined
        ? Effect.fail(error)
        : Effect.gen(function*() {
          yield* Effect.logWarning("brand sender refused; sent from Insyte", { kind: mail.kind, reason: error.reason })
          yield* lapse(sql)
          const { from: _from, ...plain } = mail
          yield* mailer.send({ ...plain, ...rest })
        }))
  )
})
