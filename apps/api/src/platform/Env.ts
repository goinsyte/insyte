/*
 * What `env` holds (02 §5.1). Merged into `Cloudflare.Env`, which types `env` from `cloudflare:workers`. Bindings join
 * with the step that first uses them (Hyperdrive in M1.2), with the name infra gives them.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      readonly ENVIRONMENT: "local" | "preview" | "staging" | "production"
      /** The commit sha, set by the deploy. Absent locally. */
      readonly VERSION?: string
      readonly LOG_LEVEL?: string
      readonly TURNSTILE_SITE_KEY?: string
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
