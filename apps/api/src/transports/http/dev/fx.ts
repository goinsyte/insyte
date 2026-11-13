import { Db } from "@insyte/database/Db"
import { fill as fillRates } from "@insyte/modules/fx/Fx"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction } from "./shared.ts"

/**
 * `POST /api/__dev/fx/fill`: the ECB's rates into `fx_rates` now, as the cron's nightly turn does (the recorded twin's,
 * in the worker tests); `GET /api/__dev/fx`: what `fx_rates` holds. Refused in production.
 */
const FxFill = HttpRouter.add(
  "POST",
  "/api/__dev/fx/fill",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    return HttpServerResponse.jsonUnsafe({ written: yield* fillRates })
  }).pipe(Effect.orDie, withRequestDb)
)

const FxOf = HttpRouter.add(
  "GET",
  "/api/__dev/fx",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const db = yield* Db
    const rates = yield* db.unscopedForCron((sql) =>
      sql`select day::text as day, base, quote, rate::text as rate from fx_rates order by day, base, quote`
    )
    return HttpServerResponse.jsonUnsafe({ rates })
  }).pipe(Effect.orDie, withRequestDb)
)

export const FxRoutes = Layer.mergeAll(FxFill, FxOf)
