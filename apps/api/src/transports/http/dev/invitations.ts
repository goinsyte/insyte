import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `POST /api/__dev/invitations/lapse?workspace=<id>&id=<invitation>`: the invitation's week is over, so the landing's
 * expired state can be tried without waiting it out. Refused in production.
 */
export const InvitationLapse = HttpRouter.add(
  "POST",
  "/api/__dev/invitations/lapse",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const request = yield* HttpServerRequest.HttpServerRequest
    const id = new URL(request.url, "http://local").searchParams.get("id") ?? ""
    const db = yield* Db
    const lapsed = yield* db.scopedFor((sql) =>
      sql<{ id: string }>`
        update invitations set expires_at = now() - interval '1 day', sent_at = now() - interval '8 days'
        where id = ${id} returning id`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ lapsed: lapsed.length })
  }).pipe(withRequestDb)
)
