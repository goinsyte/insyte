import {
  Config,
  ConfigProvider,
  Context,
  Effect,
  Exit,
  Layer,
  Logger,
  ManagedRuntime,
  Option,
  References,
  Scheduler,
  Scope,
  Tracer
} from "effect"
import { FetchHttpClient, type HttpClient } from "effect/http"
import { OtlpSerialization, OtlpTracer } from "effect/observability"
import { AppInfo, ConfigLive } from "./Bindings.ts"

/*
 * Spans and logs (17 §1–2). Effect traces every HTTP request, RPC and SQL statement itself; use cases add theirs with
 * `Effect.fn("<Slice>.<useCase>")`. Spans go to Sentry over OTLP when `OTEL_TRACES_EXPORTER=otlp` and an endpoint are
 * set, and to nowhere otherwise (local, tests). Logs are JSON on the console: Workers Logs keeps them and exports them.
 *
 * The exporter belongs to one invocation (a request, a queue batch, a cron turn, a Workflow step, a Durable Object
 * call), never to the isolate. Effect's exporter keeps a fiber that waits for spans, and a fiber that waits holds the
 * request it waited in (Effect resumes it through an `AsyncResource`). Built once per isolate, that fiber was woken by
 * the next request's first span, and workerd refused it: "Cannot call this AsyncLocalStorage bound function outside of
 * the request in which it was created". The flush then never ended, and a queue batch waited on it with every message
 * behind it. So each invocation opens its own exporter and closes it before it ends, with what it buffered sent.
 */

/** The longest a flush may hold its invocation: a slow or rate-limiting Sentry costs spans, never a batch or a step. */
const FLUSH_TIMEOUT_MS = 3_000

/**
 * Effect's own bound on the exporter's last send, inside the one above: on a hanging or rate-limiting intake Effect
 * gives up first, aborts the fetch and clears a `Retry-After` sleep, and the flush settles after it has.
 */
const EXPORT_TIMEOUT_MS = 2_500

/** One invocation's spans. */
export interface Spans {
  /** `effect`, with its spans going to this invocation's exporter. */
  readonly provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  /** The same as a request's context, for `HttpRouter.toWebHandler`'s handler. */
  readonly context: Context.Context<never>
  /** Sends what was buffered and closes the exporter. At most three seconds; never rejects; the first call does it. */
  readonly flush: () => Promise<void>
  /**
   * `flush`, once the request this context was given to has ended (`flushAtRequestEnd`): its response sent, or a
   * streamed body read to its end or dropped by the client. Spans that end while a body streams are sent with it.
   */
  readonly flushAfterRequest: () => Promise<void>
}

/** Told when the request's scope closes; in a request's context only (`Spans.context`). */
class RequestEnd extends Context.Service<RequestEnd, { readonly ended: () => void }>()("api-worker/RequestEnd") {}

/**
 * `HttpRouter.toWebHandler`'s middleware: tells the request's spans when its scope closes. A streamed body takes the
 * request's scope with it (`HttpEffect.scopeTransferToStream`), so this is after the last byte, not the response.
 */
export const flushAtRequestEnd = <A, E, R>(app: Effect.Effect<A, E, R>): Effect.Effect<A, E, R | Scope.Scope> =>
  Effect.flatMap(Effect.serviceOption(RequestEnd), (end) =>
    Option.isNone(end)
      ? app
      : Effect.andThen(Effect.addFinalizer(() => Effect.sync(end.value.ended)), app))

/** The exporter one invocation opens: Effect's, from the `OTEL_*` configuration, or Effect's own no-op tracer. */
const InvocationTracing = Layer.unwrap(Effect.gen(function*() {
  const { environment, version } = yield* AppInfo
  // One Sentry project per app; the environment tells preview, staging and production apart inside it.
  return OtlpTracer.layerFromConfig({
    resource: { serviceVersion: version, attributes: { "deployment.environment": environment } }
  })
})).pipe(
  // The exporter's shutdown timeout is read from this key; ours, whatever the stage sets.
  Layer.provide(ConfigProvider.layerAdd(
    ConfigProvider.fromEnvRecord({ OTEL_EXPORTER_OTLP_TRACES_TIMEOUT: String(EXPORT_TIMEOUT_MS) }),
    { asPrimary: true }
  ))
)

/** What an invocation's exporter needs, built once per isolate: its configuration, fetch and the serialization. */
export type SpansServices = AppInfo | HttpClient.HttpClient | OtlpSerialization.OtlpSerialization

const unexported: Spans = {
  provide: (effect) => effect,
  context: Context.empty(),
  flush: () => Promise.resolve(),
  flushAfterRequest: () => Promise.resolve()
}

/** `Telemetry` over `layer`: the Worker's configuration and fetch, or a test's. */
export const makeTelemetry = <LE>(layer: Layer.Layer<SpansServices, LE>) => {
  // The sync scheduler, as every runtime here (`InfraLayer.ts`), so the exporter's first step runs in its invocation.
  const runtime = ManagedRuntime.make(
    layer.pipe(Layer.provideMerge(Layer.succeed(Scheduler.Scheduler, new Scheduler.MixedScheduler("sync"))))
  )

  /** This invocation's spans. Its exporter is opened now, in this invocation; nothing in it outlives `flush`. */
  const open = (): Spans => {
    const scope = Scope.makeUnsafe()
    const built = runtime.runSyncExit(
      Effect.map(Layer.buildWithScope(InvocationTracing, scope), (context) => Context.get(context, Tracer.Tracer))
    )
    // Telemetry never fails the work: an exporter that cannot be opened leaves this invocation's spans unsent.
    if (Exit.isFailure(built)) return unexported
    const tracer = built.value
    let flushed: Promise<void> | undefined
    const flush = () => {
      if (flushed !== undefined) return flushed
      let timer: ReturnType<typeof setTimeout> | undefined
      // Effect gives up at 2.5 s (`EXPORT_TIMEOUT_MS`) and has closed by now; this is the bound should it not have.
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, FLUSH_TIMEOUT_MS)
      })
      flushed = Promise.race([runtime.runPromise(Scope.close(scope, Exit.void)), timeout])
        .catch(() => undefined)
        .finally(() => clearTimeout(timer))
      return flushed
    }
    let ended!: () => void
    const requestEnded = new Promise<void>((resolve) => {
      ended = resolve
    })
    return {
      provide: (effect) => Effect.withTracer(effect, tracer),
      context: Context.make(Tracer.Tracer, tracer).pipe(Context.add(RequestEnd, { ended })),
      flush,
      flushAfterRequest: () => requestEnded.then(flush)
    }
  }

  return {
    open,
    /** `effect` on `on` with spans of its own, sent (at most 3 s) before the exit returns. */
    runExit: async <A, E, R, ER>(
      on: ManagedRuntime.ManagedRuntime<R, ER>,
      effect: Effect.Effect<A, E, R>
    ): Promise<Exit.Exit<A, E | ER>> => {
      const spans = open()
      try {
        return await on.runPromiseExit(spans.provide(effect))
      } finally {
        await spans.flush()
      }
    },
    /** The same, rejecting with the failure as `runPromise` does. */
    run: async <A, E, R, ER>(on: ManagedRuntime.ManagedRuntime<R, ER>, effect: Effect.Effect<A, E, R>): Promise<A> => {
      const spans = open()
      try {
        return await on.runPromise(spans.provide(effect))
      } finally {
        await spans.flush()
      }
    }
  }
}

/** The Worker's: its `OTEL_*` configuration, `fetch` to Sentry's OTLP intake. */
export const Telemetry = makeTelemetry(
  Layer.mergeAll(AppInfo.layer, FetchHttpClient.layer, OtlpSerialization.layerJson).pipe(Layer.provide(ConfigLive))
)

const MinimumLevel = Layer.unwrap(Effect.gen(function*() {
  const level = yield* Config.LogLevel("LOG_LEVEL").pipe(Config.withDefault("Info"))
  return Layer.succeed(References.MinimumLogLevel, level)
}))

/** Logging for every runtime. Spans are the invocation's (`Telemetry.open`), not the runtime's. */
export const ObservabilityLive = Layer.mergeAll(
  Logger.layer([Logger.consoleJson]),
  MinimumLevel
)
