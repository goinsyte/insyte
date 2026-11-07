import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

/**
 * The Worker as a deployed stage configures it, with what `wrangler.jsonc` leaves out so the other worker tests stay
 * simple: a Turnstile secret (Cloudflare's published always-failing test key) and a Google OAuth client (a dummy). The
 * tests assert only what the Worker decides before calling Cloudflare or Google, so they stay offline.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TURNSTILE_SECRET_KEY: "2x0000000000000000000000000000000AA",
          GOOGLE_CLIENT_ID: "insyte-test.apps.googleusercontent.com",
          GOOGLE_CLIENT_SECRET: "not-a-real-secret"
        }
      }
    })
  ],
  test: {
    // A worker test is a journey of real requests through workerd and Postgres (twenty sign-ins, a whole account's
    // history): seconds each when every project runs at once, so 5 s is too tight.
    testTimeout: 30_000,
    name: "api-worker-configured",
    include: ["test/**/*.configured.test.ts"]
  }
})
