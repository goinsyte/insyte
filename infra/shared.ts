import * as Cloudflare from "@alchemy.run/cloudflare"
import * as Alchemy from "alchemy"
import { Effect } from "effect"
import { OBSERVABILITY } from "./stages.ts"

/*
 * What the Cloudflare account holds once, for every stage (14 §2): deployed as stage `shared` before each stage's
 * deploy, so `alchemy destroy --stage pr-<n>` can never touch it. Today: where Cloudflare sends the Workers' own logs
 * and traces (17 §7), Sentry's OTLP intake for `insyte-api`. Each Worker names these destinations in its
 * `observability` block (`app.ts`).
 */

export const SENTRY_TRACES = "sentry-traces"
export const SENTRY_LOGS = "sentry-logs"

export default Alchemy.Stack(
  "insyte-shared",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function*() {
    const tracesUrl = OBSERVABILITY.tracesEndpoint
    // The same header the API's exporter sends, stored in Effect's URI-encoded `name=value` form.
    const [name, value] = OBSERVABILITY.headers.split("=").map(decodeURIComponent)
    const headers = { [name!]: value! }

    const traces = yield* Cloudflare.ObservabilityDestination("SentryTraces", {
      name: SENTRY_TRACES,
      url: tracesUrl,
      headers,
      logpushDataset: "opentelemetry-traces"
    })
    const logs = yield* Cloudflare.ObservabilityDestination("SentryLogs", {
      name: SENTRY_LOGS,
      url: tracesUrl.replace(/\/traces$/, "/logs"),
      headers,
      logpushDataset: "opentelemetry-logs"
    })
    return { traces: traces.slug, logs: logs.slug }
  })
)
