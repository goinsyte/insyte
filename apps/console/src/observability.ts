import * as Sentry from "@sentry/react"

/*
 * Browser errors and spans to Sentry, EU (17 §4). The DSN is public by design and set at build time per environment;
 * without one (local, tests) nothing starts. `propagateTraceparent` sends W3C `traceparent` on `/api/*`, which Effect
 * reads, so the browser, the API and the SQL are one trace (spike O-S3: the option exists in @sentry/react 11). No
 * session replay here (PostHog does that), and no personal data: v11 sends none unless asked.
 */
export const startObservability = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (dsn === undefined || dsn === "") return
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_ENVIRONMENT ?? "local",
    release: import.meta.env.VITE_VERSION,
    integrations: [Sentry.browserTracingIntegration()],
    // Traffic is small through the MVP: every trace (17 §1).
    tracesSampleRate: 1,
    tracePropagationTargets: [/^\/api\//, new RegExp(`^${window.location.origin}/api/`)],
    propagateTraceparent: true
  })
}

/** Who the errors happen to, by id only (17 §5): set after sign-in and on a known session, cleared on sign-out. */
export const identify = (userId: string | null) => Sentry.setUser(userId === null ? null : { id: userId })
