import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

/**
 * The Worker with a Turnstile secret, which `wrangler.jsonc` leaves out so the other worker tests need no token. The
 * secret is Cloudflare's published always-failing test key; the tests send no token, or wrong ones, so every refusal
 * they assert is made before `siteverify` would be asked and they stay offline.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { TURNSTILE_SECRET_KEY: "2x0000000000000000000000000000000AA" } }
    })
  ],
  test: {
    name: "api-worker-turnstile",
    include: ["test/**/*.turnstile.test.ts"]
  }
})
