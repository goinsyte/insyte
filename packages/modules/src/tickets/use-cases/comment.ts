import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { type CommentInput, MemberNotActive } from "../domain/Tickets.ts"
import { commentsOf, ticketScope } from "./tickets.ts"

/*
 * "Reageren" (the ticket's activity, M11 step 3): a comment by the principal, with the teammates it names. Each one
 * named hears of it at once (`chat.mention`); the author never hears of their own. A comment has no undo: it is edited
 * or removed instead (later), as the design's composer says.
 */

export const comment = Effect.fn("Tickets.comment")(function*(input: typeof CommentInput.Type) {
  yield* Policy.require("support", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const body = input.body.trim()
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* ticketScope(sql)
      const [t] = yield* sql`select 1 from tickets t where t.id = ${input.id} and ${scope} for update`
      if (t === undefined) return yield* new NotFound({ entity: "ticket", id: input.id })
      const named = [...new Set(input.mentions ?? [])]
      if (named.length > 0) {
        const rows = yield* sql<{ id: string }>`
          select id from members where id in ${sql.in(named)} and deactivated_at is null and removed_at is null`
        const active = new Set(rows.map((r) => r.id))
        const gone = named.find((id) => !active.has(id))
        if (gone !== undefined) return yield* new MemberNotActive({ memberId: gone })
      }
      const id = mintId("tcm")
      yield* sql`insert into ticket_comments (id, workspace_id, ticket_id, kind, author_kind, author_id, body, mentions)
                 values (${id}, ${principal.workspaceId}, ${input.id}, 'comment', ${principal.kind}, ${principal.id},
                         ${body}, ${named}::text[])`
      yield* sql`update tickets set updated_at = now() where id = ${input.id}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "ticket.commented",
        subjectType: "ticket",
        subjectId: input.id,
        diff: { commentId: id, mentions: named }
      })
      const told = named.filter((m) => m !== principal.id)
      if (told.length > 0) {
        const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
          type: "ticket.mentioned",
          workspaceId: principal.workspaceId,
          userId: principal.userId ?? "system",
          ticketId: input.id,
          commentId: id,
          memberIds: told,
          by: principal.id
        })
        ;(yield* PendingEvents)?.add(outboxId)
      }
      const [made] = yield* commentsOf(sql, input.id, id)
      return made!
    })
  )
})
