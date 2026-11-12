import { Conflict, NotFound } from "@insyte/domain/Errors"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { UNDO_SECONDS, type UndoTicket } from "../domain/Undo.ts"

/*
 * The undo tokens (ADR-0023; `undo_tokens`): `issue` on the command's transaction, with the compensation and the
 * outbox rows it held back; `redeem` on the undo's, once, by the principal who did it, inside the window. The token is
 * random and only its SHA-256 is stored, as with every secret Insyte hands out.
 */

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")

/**
 * A token's SHA-256, in hex: what `undo_tokens` keeps, and what a compensation that spends another token holds in
 * place of the token itself (`proposals.restore`), so no row stores a token that could be redeemed.
 */
export const hashOf = (token: string) =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))).pipe(Effect.map(hex))

const mint = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return `und_${btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`
}

/**
 * Keeps the compensation for `command`; answers the ticket the console's toast holds. The window is `UNDO_SECONDS`
 * unless the command's kind keeps its own (`seconds`): a chat card's "Ongedaan maken" stays five minutes.
 */
export const issue = Effect.fn("Undo.issue")(function*(
  sql: SqlClient.SqlClient,
  input: {
    readonly command: string
    readonly compensation: unknown
    readonly outboxIds?: ReadonlyArray<string>
    readonly seconds?: number
  }
) {
  const principal = yield* CurrentPrincipal
  const token = mint()
  const until = Date.now() + (input.seconds ?? UNDO_SECONDS) * 1000
  yield* sql`insert into undo_tokens (token_hash, workspace_id, principal_id, command, compensation, outbox_ids,
                                      expires_at)
             values (decode(${yield* hashOf(token)}, 'hex'), ${principal.workspaceId}, ${principal.id},
                     ${input.command}, ${JSON.stringify(input.compensation)}::jsonb, ${[
    ...(input.outboxIds ?? [])
  ]}::text[],
                     ${new Date(until)})`
  return { token, until } satisfies UndoTicket
})

/**
 * Spends the token: its compensation for the caller to run, the held-back outbox rows cancelled. A token that is
 * someone else's or unknown is `NotFound`; one spent, lapsed or whose effect already left is a `Conflict`.
 */
export const redeem = Effect.fn("Undo.redeem")(function*(sql: SqlClient.SqlClient, token: string) {
  return yield* redeemByHash(sql, yield* hashOf(token))
})

/**
 * `redeem` by the token's hash (`hashOf`), for a compensation that spends the command's own token on the undo's
 * transaction. The same checks: the caller's own token, unspent, inside its window, its outbox rows not yet sent.
 *
 * `outer`: the token is spent by an outer one that was redeemed inside its own, longer window (a chat card's five
 * minutes, which hold a ticket command's eight seconds). That window governs, so this token's own lapse does not refuse
 * it, and what it held back and already went (a teammate told they were assigned) stays told; what has not gone yet is
 * still cancelled.
 */
export const redeemByHash = Effect.fn("Undo.redeemByHash")(function*(
  sql: SqlClient.SqlClient,
  hash: string,
  options?: { readonly outer?: boolean }
) {
  const outer = options?.outer === true
  const principal = yield* CurrentPrincipal
  const [row] = yield* sql<{
    command: string
    compensation: unknown
    outboxIds: ReadonlyArray<string>
    used: boolean
    lapsed: boolean
  }>`
    select command, compensation, outbox_ids, used_at is not null as used, expires_at < now() as lapsed
    from undo_tokens
    where token_hash = decode(${hash}, 'hex') and principal_id = ${principal.id}
    for update`
  if (row === undefined) return yield* new NotFound({ entity: "undo", id: "token" })
  if (row.used) return yield* new Conflict({ entity: "undo", reason: "used" })
  if (row.lapsed && !outer) return yield* new Conflict({ entity: "undo", reason: "expired" })
  if (row.outboxIds.length > 0) {
    // Locked, so a delivery under way finishes first and is seen as sent.
    const held = yield* sql<{ sent: boolean }>`
      select relayed_at is not null as sent from outbox where id in ${sql.in([...row.outboxIds])} for update`
    if (!outer && held.some((h) => h.sent)) return yield* new Conflict({ entity: "undo", reason: "already_sent" })
    yield* sql`update outbox set cancelled_at = now()
               where id in ${sql.in([...row.outboxIds])} and cancelled_at is null and relayed_at is null`
  }
  yield* sql`update undo_tokens set used_at = now() where token_hash = decode(${hash}, 'hex')`
  return { command: row.command, compensation: row.compensation }
})

/**
 * The caller's own token for `command` whose compensation holds `key` (jsonb containment), by its hash: for an undo
 * the person asks for by what it undoes rather than by the token their tab was handed (a chat card's, from any tab).
 */
export const heldBy = Effect.fn("Undo.heldBy")(function*(
  sql: SqlClient.SqlClient,
  command: string,
  key: Readonly<Record<string, string>>
) {
  const principal = yield* CurrentPrincipal
  const [row] = yield* sql<{ hash: string; used: boolean; lapsed: boolean }>`
    select encode(token_hash, 'hex') as hash, used_at is not null as used, expires_at < now() as lapsed
    from undo_tokens
    where principal_id = ${principal.id} and command = ${command} and compensation @> ${JSON.stringify(key)}::jsonb
    order by expires_at desc
    limit 1`
  return row
})
