import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { digestWorkspace, notifyWorkspace } from "../../../platform/relay/subscribers/notifications.ts"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `POST /api/__dev/notify/sweep?workspace=<id>&at=<iso>`: one workspace's turn of the notification sweeps (M11 step
 * 13.5) as if it were `at` (now when absent): the notes due then sent, and the digests whose hour has come; `&since=`
 * widens the digest's window to the notes since then, for a day that is not today. Refused in production.
 */
const NotifySweep = HttpRouter.add(
  "POST",
  "/api/__dev/notify/sweep",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const request = yield* HttpServerRequest.HttpServerRequest
    const query = new URL(request.url, "http://local").searchParams
    const at = query.get("at") === null ? undefined : new Date(query.get("at")!)
    const since = query.get("since") === null ? undefined : new Date(query.get("since")!)
    const sent = yield* notifyWorkspace(workspace, at)
    const digests = yield* digestWorkspace(workspace, at, since)
    return HttpServerResponse.jsonUnsafe({ sent, digests })
  }).pipe(Effect.orDie, withRequestDb)
)

/**
 * `GET /api/__dev/notify/deliveries?workspace=<id>`: the workspace's deliveries outside the app, newest first, ids,
 * channels, states, why one did not go, and a mail's answer token (M11 step 13.5). Refused in production.
 */
const NotifyDeliveries = HttpRouter.add(
  "GET",
  "/api/__dev/notify/deliveries",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const db = yield* Db
    const deliveries = yield* db.scopedFor((sql) =>
      sql<
        {
          recipientId: string
          channel: string
          kind: string
          state: string
          attempts: number
          error: string | null
          replyToken: string | null
        }
      >`
        select recipient_id, channel, kind, state, attempts, error, reply_token from notification_deliveries
        order by created_at desc limit 50`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    return HttpServerResponse.jsonUnsafe({ deliveries })
  }).pipe(Effect.orDie, withRequestDb)
)

export const NotifyRoutes = Layer.mergeAll(NotifySweep, NotifyDeliveries)
