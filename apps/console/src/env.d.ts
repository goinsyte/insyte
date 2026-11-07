/** What the console Worker's `env` holds. */
declare global {
  namespace Cloudflare {
    interface Env {
      /** The API Worker. `/api/*` goes here before Start runs; SSR calls it the same way. */
      readonly API: Fetcher
      readonly ENVIRONMENT: "local" | "preview" | "staging" | "production"
    }
  }
}

/** Build-time values (Vite), public by design: set per environment by the deploy's console build. */
declare global {
  interface ImportMetaEnv {
    readonly VITE_SENTRY_DSN?: string
    readonly VITE_ENVIRONMENT?: string
    readonly VITE_VERSION?: string
  }
}

export {}
