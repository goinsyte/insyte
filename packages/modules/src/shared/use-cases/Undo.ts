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

const hashOf = (token: string) =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))).pipe(Effect.map(hex))

const mint = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return `und_${btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`
}

/** Keeps the compensation for `command`; answers the ticket the console's toast holds. */
export const issue = Effect.fn("Undo.issue")(function*(
  sql: SqlClient.SqlClient,
  input: { readonly command: string; readonly compensation: unknown; readonly outboxIds?: ReadonlyArray<string> }
) {
  const principal = yield* CurrentPrincipal
  const token = mint()
  const until = Date.now() + UNDO_SECONDS * 1000
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
    where token_hash = decode(${yield* hashOf(token)}, 'hex') and principal_id = ${principal.id}
    for update`
  if (row === undefined) return yield* new NotFound({ entity: "undo", id: "token" })
  if (row.used) return yield* new Conflict({ entity: "undo", reason: "used" })
  if (row.lapsed) return yield* new Conflict({ entity: "undo", reason: "expired" })
  if (row.outboxIds.length > 0) {
    // Locked, so a delivery under way finishes first and is seen as sent.
    const held = yield* sql<{ sent: boolean }>`
      select relayed_at is not null as sent from outbox where id in ${sql.in([...row.outboxIds])} for update`
    if (held.some((h) => h.sent)) return yield* new Conflict({ entity: "undo", reason: "already_sent" })
    yield* sql`update outbox set cancelled_at = now()
               where id in ${sql.in([...row.outboxIds])} and cancelled_at is null`
  }
  yield* sql`update undo_tokens set used_at = now() where token_hash = decode(${yield* hashOf(token)}, 'hex')`
  return { command: row.command, compensation: row.compensation }
})
