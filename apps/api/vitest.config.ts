import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

/** The Worker's tests run inside workerd, against `wrangler.jsonc`, through the Worker's own `fetch`. */
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    name: "api-worker",
    include: ["test/**/*.worker.test.ts"]
  }
})
