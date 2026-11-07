import { Config, Effect, Layer, Logger, References } from "effect"
import { OtlpExporter, OtlpSerialization, OtlpTracer } from "effect/observability"
import { AppInfo } from "./Bindings.ts"

/*
 * Spans and logs (17 §1–2). Effect traces every HTTP request, RPC and SQL statement itself; use cases add theirs with
 * `Effect.fn("<Slice>.<useCase>")`. Spans go to Sentry over OTLP when `OTEL_TRACES_EXPORTER=otlp` and an endpoint are
 * set, and to nowhere otherwise (local, tests). Logs are JSON on the console: Workers Logs keeps them and exports them.
 */

/**
 * Filled in when the layer is built. `Main.ts` calls it in `waitUntil` once the response is out: an isolate can be
 * frozen between requests, so the exporter's own timer is not trusted (`OTEL_BSP_SCHEDULE_DELAY` is an hour).
 */
export const Telemetry = { flush: (): Promise<void> => Promise.resolve() }

const RegisterFlush = Layer.effectDiscard(Effect.gen(function*() {
  const flusher = yield* OtlpExporter.Flusher
  const context = yield* Effect.context<never>()
  Telemetry.flush = () => Effect.runPromiseWith(context)(flusher.flush)
}))

const Tracing = Layer.unwrap(Effect.gen(function*() {
  const { environment, version } = yield* AppInfo
  return RegisterFlush.pipe(
    Layer.provideMerge(OtlpTracer.layerFromConfig({
      // One Sentry project per app; the environment tells preview, staging and production apart inside it.
      resource: { serviceVersion: version, attributes: { "deployment.environment": environment } }
    }))
  )
}))

const MinimumLevel = Layer.unwrap(Effect.gen(function*() {
  const level = yield* Config.LogLevel("LOG_LEVEL").pipe(Config.withDefault("Info"))
  return Layer.succeed(References.MinimumLogLevel, level)
}))

/** Needs an `HttpClient` (the exporter's) and `AppInfo`. */
export const ObservabilityLive = Layer.mergeAll(
  Tracing,
  Logger.layer([Logger.consoleJson]),
  MinimumLevel
).pipe(Layer.provide(OtlpSerialization.layerJson))
