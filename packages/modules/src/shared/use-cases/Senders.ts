import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { MailKind } from "../domain/Mailer.ts"
import { sendersFor } from "../domain/Senders.ts"

/*
 * The sender of a shopper's mail (M17 step 20.1c), read on the caller's transaction in its workspace's scope: the one
 * place a returns mail, a delay mail or an inbox message learns whether it goes from the brand's own domain. Spread
 * into the `Mail`; with nothing set, or the domain not verified yet, it adds nothing and Insyte's sender stays.
 */
export const customerSender = Effect.fn("Senders.customerSender")(function*(
  sql: SqlClient.SqlClient,
  kind: MailKind
) {
  const rows = yield* sql<{ value: unknown }>`select value from workspace_settings where section = 'domain_senders'`
  return sendersFor(rows[0]?.value, kind)
})
