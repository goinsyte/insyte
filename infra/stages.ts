/*
 * What each stage is configured with that is not a secret, committed so a deploy reads it from the repo and not from
 * GitHub. GitHub keeps the deploy's own credentials; the API Worker's secrets
 * are set on the Worker itself (`wrangler secret put --name insyte-api-<stage>`), which a deploy never removes, and
 * `apps/api/.dev.vars` holds them locally.
 */

export type Environment = "preview" | "staging" | "production"

/** Sentry's OTLP intake for `insyte-api` (17 §7). The header carries the project's public key, as the DSN does. */
export const OBSERVABILITY = {
  tracesEndpoint: "https://o4511614812160000.ingest.de.sentry.io/api/4512391663648848/integration/otlp/v1/traces",
  headers: "x-sentry-auth=sentry%20sentry_key%3De303b4510b81eab953c1912f203517ea",
  dsn: "https://65513f695782e21ed6d46a02e779d973@o4511614812160000.ingest.de.sentry.io/4512391663714384",
  scheduleDelay: "3600000"
} as const

export interface Stage {
  /** The Neon project the stage's database lives in: nonprod for previews and staging, prod for production. */
  readonly neonProjectId: string
  /** `main`'s host; a preview connects to its own branch instead. */
  readonly databaseHost?: string
  /** Its own Turnstile widget for the console's hostname; previews use Cloudflare's test keys. */
  readonly turnstileWidget: boolean
  /** Google sign-in's OAuth client id (public); its secret is the Worker's `GOOGLE_CLIENT_SECRET`. */
  readonly googleClientId?: string
  /** Resend once the Worker has `RESEND_API_KEY`; the API captures mail until then. */
  readonly mailAdapter: "capture" | "resend"
}

export const STAGES: Record<Environment, Stage> = {
  preview: {
    neonProjectId: "empty-sea-45605934",
    turnstileWidget: false,
    mailAdapter: "capture"
  },
  staging: {
    neonProjectId: "empty-sea-45605934",
    databaseHost: "ep-steep-cloud-bauuhu2n.c-8.eu-central-1.aws.neon.tech",
    turnstileWidget: true,
    googleClientId: "382739649272-7d3ivsof8brj9hutlt0aehaehm212ha7.apps.googleusercontent.com",
    mailAdapter: "resend"
  },
  production: {
    neonProjectId: "hidden-union-36896112",
    databaseHost: "ep-curly-truth-bab2dhrc.c-8.eu-central-1.aws.neon.tech",
    turnstileWidget: true,
    mailAdapter: "capture"
  }
}

/**
 * The API Worker's secrets, by name: set on `insyte-api-staging` and `insyte-api-production` by hand, never by a
 * deploy. An integration whose secrets are not all there stays off. A preview has only `BETTER_AUTH_SECRET`, which
 * its stack generates.
 */
export const WORKER_SECRETS = [
  "BETTER_AUTH_SECRET",
  "SEAL_KEYS",
  "GOOGLE_CLIENT_SECRET",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_CLIENT_SECRET",
  "KLAVIYO_CLIENT_ID",
  "KLAVIYO_CLIENT_SECRET",
  "RESEND_API_KEY",
  "AFTERSHIP_API_KEY",
  "AFTERSHIP_WEBHOOK_SECRET",
  "SENDCLOUD_PUBLIC_KEY",
  "SENDCLOUD_SECRET_KEY"
] as const
