import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { recheck } from "@insyte/modules/settings/use-cases/sending-domain"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * E-mail en domein's worker tests (M17 step 20.1c), refused in production: `POST /api/__dev/sending-domain/age
 * ?workspace=<id>&days=<n>` puts the workspace's claim that many days back; `POST /api/__dev/sending-domain/recheck
 * ?workspace=<id>` runs its daily re-check now.
 */
const SendingDomainAge = HttpRouter.add(
  "POST",
  "/api/__dev/sending-domain/age",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const request = yield* HttpServerRequest.HttpServerRequest
    const days = Number(new URL(request.url, "http://local").searchParams.get("days") ?? "0")
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      sql`update sending_domains set claimed_at = claimed_at - make_interval(days => ${days})`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    return HttpServerResponse.jsonUnsafe({ aged: true })
  }).pipe(Effect.orDie, withRequestDb)
)

const SendingDomainRecheck = HttpRouter.add(
  "POST",
  "/api/__dev/sending-domain/recheck",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const outcome = yield* recheck().pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    return HttpServerResponse.jsonUnsafe({ outcome })
  }).pipe(Effect.orDie, withRequestDb)
)

export const SendingDomainRoutes = Layer.mergeAll(SendingDomainAge, SendingDomainRecheck)
