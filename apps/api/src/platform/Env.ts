import type { RateLimiter } from "./RateLimiter.ts"

/*
 * What `env` holds (02 §5.1). Merged into `Cloudflare.Env`, which types `env` from `cloudflare:workers`. Bindings join
 * with the step that first uses them, with the name infra gives them.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      /** Postgres through Hyperdrive, as `insyte_app`. Caching off: a read after a write must see the write. */
      readonly HYPERDRIVE: Hyperdrive
      /** Sign-in, sign-up and mail limits per IP and per address (`RateLimiter`, M2.3). */
      readonly RATE_LIMITER: DurableObjectNamespace<RateLimiter>
      readonly ENVIRONMENT: "local" | "preview" | "staging" | "production"
      /** The console's origin: better-auth's baseURL, cookies and links in mail (18 §2). */
      readonly CONSOLE_ORIGIN: string
      /** A secret: signs better-auth's cookies and tokens. Absent locally (a fixed development value stands in). */
      readonly BETTER_AUTH_SECRET?: string
      /** The commit sha, set by the deploy. Absent locally. */
      readonly VERSION?: string
      readonly LOG_LEVEL?: string
      readonly TURNSTILE_SITE_KEY?: string
      /** A secret: verifies Turnstile tokens. Absent locally, where nothing asks for Turnstile (`HumanCheck.ts`). */
      readonly TURNSTILE_SECRET_KEY?: string
      /** Google's OAuth client for this stage (not a secret: it is in every sign-in URL). Absent on previews. */
      readonly GOOGLE_CLIENT_ID?: string
      /** A secret: Google's OAuth client secret. */
      readonly GOOGLE_CLIENT_SECRET?: string
      /** `resend` sends mail through Resend; anything else, or absent, captures it for the dev route (02 §5.1). */
      readonly MAIL_ADAPTER?: string
      /** The sender, `Insyte <noreply@mail.goinsyte.com>` by default. */
      readonly MAIL_FROM?: string
      /** A secret: Resend's sending key, where `MAIL_ADAPTER=resend`. */
      readonly RESEND_API_KEY?: string
      /** `off` admits every address; anything else, or absent, keeps the beta gate shut (M2.2). */
      readonly BETA_GATE?: string
      /** Comma-separated domains admitted on this stage beside `beta_allowlist`. */
      readonly BETA_ALLOWED_DOMAINS?: string
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
