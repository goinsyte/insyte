import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { decodeOr } from "../domain/Check.ts"
import { domainOfWebsite, type StoredDomain, StoredSenders } from "../domain/SendingDomain.ts"

/*
 * What E-mail en domein's section and its checks read beside the senders (step 20.1c): the section as stored, the
 * domain the senders are on, and the mailboxes an answer may go to.
 */

const NONE: StoredSenders = { from: "", replyTo: "", domain: null }

export const storedOf = (raw: unknown): StoredSenders => decodeOr(StoredSenders, raw, NONE)

/** The website at Huisstijl, as saved; empty without one. */
const websiteOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<
      { website: string | null }
    >`select value ->> 'website' as website from workspace_settings where section = 'brand'`,
    (rows) => rows[0]?.website ?? ""
  )

/** The sending domain: the one made at the provider, or else the one the brand's website names; none without either. */
export const domainNameOf = Effect.fn("SendingDomain.domainNameOf")(function*(
  sql: SqlClient.SqlClient,
  domain: StoredDomain | null | undefined
) {
  if (domain !== null && domain !== undefined) return domain.name
  return domainOfWebsite(yield* websiteOf(sql))
})

/** The workspace's connected mailboxes' addresses, lower case: where an answer lands in the Inbox. */
export const mailboxesOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ address: string }>`select lower(address) as address from mailboxes where status = 'connected'`,
    (rows) => rows.map((r) => r.address)
  )
