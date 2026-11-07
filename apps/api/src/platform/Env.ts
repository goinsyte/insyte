/*
 * What `env` holds (02 §5.1). Merged into `Cloudflare.Env`, which types `env` from `cloudflare:workers`. Bindings join
 * with the step that first uses them, with the name infra gives them.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      /** Postgres through Hyperdrive, as `insyte_app`. Caching off: a read after a write must see the write. */
      readonly HYPERDRIVE: Hyperdrive
      readonly ENVIRONMENT: "local" | "preview" | "staging" | "production"
      /** The console's origin: better-auth's baseURL, cookies and links in mail (18 §2). */
      readonly CONSOLE_ORIGIN: string
      /** A secret: signs better-auth's cookies and tokens. Absent locally (a fixed development value stands in). */
      readonly BETTER_AUTH_SECRET?: string
      /** The commit sha, set by the deploy. Absent locally. */
      readonly VERSION?: string
      readonly LOG_LEVEL?: string
      readonly TURNSTILE_SITE_KEY?: string
      /** The console's Sentry DSN, public by design; returned by `GET /api/config`. */
      readonly SENTRY_DSN?: string
      readonly OTEL_SERVICE_NAME?: string
      readonly OTEL_TRACES_EXPORTER?: string
      readonly OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?: string
      /** A secret: `x-sentry-auth=…`. */
      readonly OTEL_EXPORTER_OTLP_HEADERS?: string
      readonly OTEL_BSP_SCHEDULE_DELAY?: string
    }
  }
}

export type Env = Cloudflare.Env
