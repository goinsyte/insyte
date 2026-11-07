import { Config, Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { AppInfo } from "../../platform/Bindings.ts"

/** `GET /api/health`: what runs where. Read by the deploy smoke test and uptime checks. */
const Health = HttpRouter.add(
  "GET",
  "/api/health",
  Effect.gen(function*() {
    const { environment, version } = yield* AppInfo
    return HttpServerResponse.jsonUnsafe({ version, environment })
  })
)

/** `GET /api/config`: the public settings a client needs before it signs in. Never a secret. */
const PublicConfig = HttpRouter.add(
  "GET",
  "/api/config",
  Effect.gen(function*() {
    const turnstileSiteKey = yield* Config.String("TURNSTILE_SITE_KEY").pipe(Config.withDefault(""))
    return HttpServerResponse.jsonUnsafe({ turnstileSiteKey, signInProviders: [], flags: {} })
  })
)

export const SystemRoutes = Layer.mergeAll(Health, PublicConfig)
