import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import { Relay } from "../../../shared/domain/Outbox.ts"
import * as Audit from "../../../shared/use-cases/Audit.ts"
import * as Outbox from "../../../shared/use-cases/Outbox.ts"
import { Accepted, type LandingRef, NotAcceptable } from "../../domain/Landing.ts"
import { classify } from "./landing.ts"
import { route } from "./route.ts"

/*
 * Accepting from the landing (M3.4), as the signed-in person, inside the invitation's workspace: the seats and the
 * sign-in policy are checked now, not when it was sent. They join with the role and stores the invitation names (the
 * link's role, for the link), a removed member's row comes back, and `member.joined` goes in the outbox (M5 tells the
 * inviter). Declining is theirs too.
 */

export const accept = Effect.fn("Landing.accept")(function*(ref: LandingRef) {
  const user = yield* CurrentUser
  const relay = yield* Relay
  const db = yield* Db
  const found = yield* route(ref)
  if (found === undefined) return yield* new NotAcceptable({ state: "missing" })

  const { result, outboxIds } = yield* db.asUserIn(found.workspaceId as WorkspaceId)((sql) =>
    Effect.gen(function*() {
      const landing = yield* classify(sql, ref, found, user)
      if (landing.state === "sso") {
        const google = yield* sql<{ id: string }>`
          select id from auth.account where user_id = ${user.id} and provider_id = 'google'`
        if (google.length === 0) return yield* new NotAcceptable({ state: "sso" })
      } else if (landing.state !== "existing" && landing.state !== "link") {
        return yield* new NotAcceptable({ state: landing.state })
      }

      // A supplier's person (M16): they become its contact, through `supplier_contact_join` (0075), and land in its portal.
      if (!found.link && landing.supplier != null) {
        const [joined] = yield* sql<{ contactId: string | null }>`
          select supplier_contact_join(${ref.id}, ${mintId("sct")}) as contact_id`
        if (joined?.contactId == null) return yield* new NotAcceptable({ state: "missing" })
        yield* Audit.write(sql, found.workspaceId, { kind: "supplier_contact", id: joined.contactId }, {
          action: "supplier.contact_joined",
          subjectType: "supplier_contact",
          subjectId: joined.contactId,
          diff: { via: "invitation" }
        })
        return {
          result: new Accepted({
            workspaceId: found.workspaceId,
            workspace: landing.workspace ?? "",
            landing: "/supplier/dashboard"
          }),
          outboxIds: []
        }
      }

      const invitation = found.link
        ? undefined
        : (yield* sql<{ roleId: string; stores: unknown; invitedBy: string }>`
            select role_id, stores, invited_by from invitations where id = ${ref.id} for update`)[0]
      const roleId = invitation?.roleId ?? (yield* sql<{ roleId: string }>`select role_id from invite_links`)[0]!.roleId
      const stores = JSON.stringify(invitation?.stores ?? "all")
      const [member] = yield* sql<{ id: string }>`
        insert into members (id, workspace_id, user_id, role_id, stores, invited_by)
        values (${mintId("mem")}, ${found.workspaceId}, ${user.id}, ${roleId}, ${stores}::jsonb,
                ${invitation?.invitedBy ?? null})
        on conflict (workspace_id, user_id) do update set
          role_id = excluded.role_id, stores = excluded.stores, invited_by = excluded.invited_by,
          removed_at = null, deactivated_at = null, joined_at = now()
        where members.removed_at is not null or members.deactivated_at is not null
        returning id`
      const memberId = member?.id ??
        (yield* sql<{ id: string }>`select id from members where user_id = ${user.id}`)[0]!.id

      if (found.link) yield* sql`update invite_links set joined_count = joined_count + 1`
      else yield* sql`update invitations set accepted_at = now(), accepted_by_user = ${user.id} where id = ${ref.id}`

      yield* Audit.write(sql, found.workspaceId, { kind: "member", id: memberId }, {
        action: "member.joined",
        subjectType: "member",
        subjectId: memberId,
        diff: { role: roleId, via: found.link ? "link" : "invitation" }
      })
      const outboxId = yield* Outbox.write(sql, found.workspaceId, {
        type: "member.joined",
        workspaceId: found.workspaceId,
        memberId,
        userId: user.id,
        via: found.link ? "link" : "invitation"
      })
      return {
        result: new Accepted({
          workspaceId: found.workspaceId,
          workspace: landing.workspace ?? "",
          landing: "/dashboard"
        }),
        outboxIds: [outboxId]
      }
    })
  )
  yield* relay.kick(outboxIds)
  return result
})

/** "Weigeren": the invitee says no; the link stops working and the seat frees up. */
export const decline = Effect.fn("Landing.decline")(function*(ref: LandingRef) {
  const user = yield* CurrentUser
  const db = yield* Db
  const found = yield* route(ref)
  if (found === undefined || found.link) {
    return yield* new NotAcceptable({ state: found === undefined ? "missing" : "link" })
  }
  return yield* db.asUserIn(found.workspaceId as WorkspaceId)((sql) =>
    Effect.gen(function*() {
      const landing = yield* classify(sql, ref, found, user)
      if (landing.state !== "existing" && landing.state !== "full" && landing.state !== "sso") {
        return yield* new NotAcceptable({ state: landing.state })
      }
      yield* sql`update invitations set declined_at = now() where id = ${ref.id}`
      yield* sql`update outbox set cancelled_at = now()
                 where event = 'member.invited' and payload ->> 'invitationId' = ${ref.id}
                   and relayed_at is null and cancelled_at is null`
      yield* Audit.write(sql, found.workspaceId, { kind: "system", id: "landing", onBehalfOf: user.id }, {
        action: "member.invitation_declined",
        subjectType: "invitation",
        subjectId: ref.id
      })
      return yield* classify(sql, ref, found, user)
    })
  )
})
