import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { CurrentViewer } from "@insyte/domain/Session"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../../shared/use-cases/Audit.ts"
import type { LandingRef, LandingState } from "../../domain/Landing.ts"
import { classify, MISSING } from "./landing.ts"
import { route } from "./route.ts"

/*
 * The public half of the landing (M3.4): what the link shows, to whoever opened it, and the two things a visitor may
 * ask of a link that no longer lets them in: a new invitation (expired) or a seat (full). Each is read and written in
 * the invitation's workspace as `system`, and each answers the landing again.
 */

const inWorkspace = <A, E, R>(workspaceId: string, f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>) =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedFor(f)).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId })
  )

export const resolve = Effect.fn("Landing.resolve")(function*(ref: LandingRef) {
  const { user } = yield* CurrentViewer
  const found = yield* route(ref)
  if (found === undefined) return MISSING
  return yield* inWorkspace(found.workspaceId, (sql) => classify(sql, ref, found, user))
})

/**
 * Asking the inviter, once, recorded for them (M5 tells them): a new invitation ("Nieuwe uitnodiging vragen" when it
 * lapsed, "<naam> mailen" when it was revoked, "<naam> vragen mijn werkadres uit te nodigen" to the wrong account) or
 * a seat ("om een plek vragen"). The landing never shows the inviter's address, so it asks through here.
 */
const ask = (column: "requested_new_at" | "seat_requested_at", when: ReadonlyArray<LandingState>, action: string) =>
  Effect.fn(`Landing.${action}`)(function*(ref: LandingRef) {
    const { user } = yield* CurrentViewer
    const found = yield* route(ref)
    if (found === undefined || found.link) return found === undefined ? MISSING : yield* resolve(ref)
    return yield* inWorkspace(found.workspaceId, (sql) =>
      Effect.gen(function*() {
        const before = yield* classify(sql, ref, found, user)
        if (!when.includes(before.state) || before.requested) return before
        yield* sql`update invitations set ${sql(column)} = now() where id = ${ref.id}`
        yield* Audit.write(sql, found.workspaceId, { kind: "system", id: "landing" }, {
          action: `member.invitation_${action}`,
          subjectType: "invitation",
          subjectId: ref.id
        })
        return yield* classify(sql, ref, found, user)
      }))
  })

export const requestNew = ask("requested_new_at", ["expired", "revoked", "other-account"], "requested_new")
export const requestSeat = ask("seat_requested_at", ["full"], "seat_requested")
