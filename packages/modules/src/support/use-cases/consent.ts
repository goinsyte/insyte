import { Db } from "@insyte/database/Db"
import { Forbidden } from "@insyte/domain/Errors"
import { CurrentPrincipal, type Principal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { CONSENT_DAYS, type SetSupportAccess, SupportAccess } from "../domain/Support.ts"

/*
 * The workspace's side of Insyte-support looking along (M18): every member reads whether support may look along and
 * whether it does right now (the banner); only the owner turns the consent on, for `CONSENT_DAYS`, or off. Turning it
 * off ends every session at once: each read of one checks the consent again (`staff.ts`). The change is in the
 * Logboek (Gegevens en privacy), as any setting's.
 */

/** Whether a member may change it: the owner, as for the workspace's export and deletion. */
const isOwner = (principal: Principal) => principal.kind === "member" && principal.role.id === "owner"

const read = (sql: SqlClient.SqlClient, canChange: boolean) =>
  Effect.gen(function*() {
    const [workspace] = yield* sql<{ until: Date | null; by: string | null }>`
      select w.support_access_until as until, u.name as by
      from workspaces w
      left join members m on m.id = w.support_access_by
      left join auth."user" u on u.id = m.user_id
      where w.id = app_workspace_id() and w.support_access_until > now()`
    const [session] = yield* sql<{ startedAt: Date; expiresAt: Date }>`
      select started_at, expires_at from staff_sessions
      where ended_at is null and expires_at > now()
      order by started_at desc limit 1`
    const until = workspace?.until ?? null
    return new SupportAccess({
      until: until === null ? null : until.getTime(),
      by: until === null ? null : workspace?.by ?? null,
      // A session past the consent has ended with it.
      session: session === undefined || until === null
        ? null
        : { startedAt: session.startedAt.getTime(), endsAt: Math.min(session.expiresAt.getTime(), until.getTime()) },
      canChange,
      days: CONSENT_DAYS
    })
  })

/** Read by every member: the page's switch and the frame's banner. */
export const status = Effect.fn("Support.status")(function*() {
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) => read(sql, isOwner(principal)))
})

/** The owner's switch: on for `CONSENT_DAYS` from now (again from now when it was on), or off. */
export const setAccess = Effect.fn("Support.setAccess")(function*(input: SetSupportAccess) {
  const principal = yield* CurrentPrincipal
  if (!isOwner(principal)) {
    return yield* new Forbidden({ permission: "owner", level: 0, roleLabel: principal.role.label })
  }
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [before] = yield* sql<{ on: boolean }>`
        select coalesce(support_access_until > now(), false) as on from workspaces where id = ${principal.workspaceId}
        for update`
      yield* input.on
        ? sql`update workspaces
              set support_access_until = now() + make_interval(days => ${CONSENT_DAYS}),
                  support_access_by = ${principal.id}
              where id = ${principal.workspaceId}`
        : sql`update workspaces set support_access_until = null, support_access_by = null
              where id = ${principal.workspaceId}`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "support.access_changed",
        subjectType: "support",
        subjectId: principal.workspaceId,
        section: "support",
        diff: { from: before?.on ?? false, to: input.on }
      })
      return yield* read(sql, true)
    })
  )
})
