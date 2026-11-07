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

export {}
