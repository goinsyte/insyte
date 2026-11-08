import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

/** The Worker's tests run inside workerd, against `wrangler.jsonc`, through the Worker's own `fetch`. */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Shopify's recorded twin: CI never calls Shopify (integrations.md §1.1).
      // Pages of four lines, so a line item lands in a later page than its order.
      miniflare: { bindings: { SHOPIFY_ADAPTER: "recorded", SYNC_PAGE_LINES: "4" } }
    })
  ],
  test: {
    // A worker test is a journey of real requests through workerd and Postgres (twenty sign-ins, a whole account's
    // history): seconds each when every project runs at once, so 5 s is too tight.
    testTimeout: 30_000,
    name: "api-worker",
    include: ["test/**/*.worker.test.ts"]
  }
})
