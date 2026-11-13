import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { syncAdSpend } from "@insyte/modules/costs/Costs"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { AdSpendLive } from "../../../platform/AdSpend.ts"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/**
 * `POST /api/__dev/costs/ad-account?workspace=<id>` `{ provider, status, spend: [{ day, spendMinor, currency? }] }`: an
 * ad account as a connection would leave it, with the spend it reported, for the costs' worker tests (M13 step 5): no
 * Meta or Google Ads account can be connected yet. `POST /api/__dev/costs/sync`: the daily ad spend sync now. Refused
 * in production.
 */
const CostsAdAccount = HttpRouter.add(
  "POST",
  "/api/__dev/costs/ad-account",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = { id: (yield* workspaceParam) as WorkspaceId }
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = (yield* request.json) as {
      readonly provider: "meta" | "google_ads"
      readonly status?: string
      readonly spend?: ReadonlyArray<{ readonly day: string; readonly spendMinor: number; readonly currency?: string }>
    }
    const db = yield* Db
    const id = mintId("con")
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        yield* sql`insert into connections (id, workspace_id, provider, account_ref, status)
                   values (${id}, ${workspace.id}, ${body.provider}, ${`act_${id}`}, ${body.status ?? "connected"})`
        for (const s of body.spend ?? []) {
          yield* sql`insert into ad_spend_day (workspace_id, connection_id, provider, account_ref, day, spend_minor,
                                               currency)
                     values (${workspace.id}, ${id}, ${body.provider}, ${`act_${id}`}, ${s.day}::date, ${s.spendMinor},
                             ${s.currency ?? "EUR"})`
        }
      })
    ).pipe(Effect.provideService(CurrentWorkspace, workspace))
    return HttpServerResponse.jsonUnsafe({ connectionId: id })
  }).pipe(Effect.orDie, withRequestDb)
)

const CostsSync = HttpRouter.add(
  "POST",
  "/api/__dev/costs/sync",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    return HttpServerResponse.jsonUnsafe({ written: yield* syncAdSpend() })
  }).pipe(Effect.provide(AdSpendLive), withRequestDb)
)

export const CostsRoutes = Layer.mergeAll(CostsAdAccount, CostsSync)
