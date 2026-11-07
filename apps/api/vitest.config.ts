import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

/** The Worker's tests run inside workerd, against `wrangler.jsonc`, through the Worker's own `fetch`. */
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    // A worker test is a journey of real requests through workerd and Postgres (twenty sign-ins, a whole account's
    // history): seconds each when every project runs at once, so 5 s is too tight.
    testTimeout: 30_000,
    name: "api-worker",
    include: ["test/**/*.worker.test.ts"]
  }
})
