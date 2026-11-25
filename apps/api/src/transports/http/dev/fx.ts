import { Db } from "@insyte/database/Db"
import { fill as fillRates } from "@insyte/modules/fx/Fx"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction } from "./shared.ts"

/**
 * `POST /api/__dev/fx/fill`: the ECB's rates into `fx_rates` now, as the cron's nightly turn does (the recorded twin's,
 * in the worker tests); `GET /api/__dev/fx`: what `fx_rates` holds; `POST /api/__dev/fx/rates`: rates of so many days
 * ago, counted on the database's own day, for the tests that need one recent (the recorded twin's days age) or one too
 * old to use; with `replace`, in place of every rate the pair had. Refused in production.
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

const FxRates = HttpRouter.add(
  "POST",
  "/api/__dev/fx/rates",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = (yield* request.json) as {
      readonly replace?: boolean
      readonly rates: ReadonlyArray<
        { readonly base: string; readonly quote: string; readonly rate: string; readonly ageDays: number }
      >
    }
    const db = yield* Db
    yield* db.unscopedForCron((sql) =>
      Effect.gen(function*() {
        if (body.replace === true) {
          for (const r of body.rates) yield* sql`delete from fx_rates where base = ${r.base} and quote = ${r.quote}`
        }
        for (const r of body.rates) {
          yield* sql`insert into fx_rates (day, base, quote, rate)
                     values (current_date - ${r.ageDays}::int, ${r.base}, ${r.quote}, ${r.rate}::numeric)
                     on conflict (day, base, quote) do update set rate = excluded.rate`
        }
      })
    )
    return HttpServerResponse.jsonUnsafe({ written: body.rates.length })
  }).pipe(Effect.orDie, withRequestDb)
)

export const FxRoutes = Layer.mergeAll(FxFill, FxOf, FxRates)
