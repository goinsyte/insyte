import { InvitationLinks } from "@insyte/modules/members/domain/Ports"
import { Mailer } from "@insyte/modules/shared/domain/Mailer"
import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { subscriber } from "../Subscriber.ts"

/**
 * The invitation's mail (M3.4), once its undo window has passed: only if it is still open and still in the round the
 * mail was written for (a resend or a revoke since then is its own story), with the facts read now. A mail that does
 * not go fails the delivery, so the queue tries again. A supplier's person (M16) is invited to its portal, which the
 * mail names in place of a role.
 */
const invitationMail = (event: Extract<OutboxEvent, { type: "member.invited" }>, sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const [row] = yield* sql<{
      email: string
      message: string | null
      expiresAt: Date
      workspace: string
      inviter: string
      role: string
    }>`
      select i.email, i.message, i.expires_at, w.name as workspace, u.name as inviter,
             coalesce(r.label, 'Leveranciersportaal (' || s.name || ')') as role
      from invitations i
      join workspaces w on w.id = i.workspace_id
      join members m on m.id = i.invited_by
      join auth."user" u on u.id = m.user_id
      left join roles r on r.workspace_id = i.workspace_id and r.id = i.role_id
      left join suppliers s on s.id = i.supplier_id
      where (r.id is not null or s.id is not null) and i.id = ${event.invitationId} and i.round = ${event.round} and i.expires_at > now()
        and i.accepted_at is null and i.revoked_at is null and i.declined_at is null`
    if (row === undefined) return
    const { url } = yield* (yield* InvitationLinks).invitation(event.invitationId, event.round)
    yield* (yield* Mailer).send({
      kind: "team.invite",
      to: row.email,
      url,
      invitation: {
        workspace: row.workspace,
        inviter: row.inviter,
        role: row.role,
        message: row.message ?? undefined,
        expiresAt: row.expiresAt
      }
    })
  }).pipe(Effect.orDie)

/** The mail sink's part for the team's invitations. */
export const InvitationMail = subscriber("mail", {
  "member.invited": (_id, event, sql) => invitationMail(event, sql)
})
