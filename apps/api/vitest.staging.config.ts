import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

/**
 * The Worker with `ENVIRONMENT` at `staging`, as that stage runs it (`infra/app.ts`): for what the Worker refuses there
 * that it serves locally and on previews, such as the `__dev` routes (`test/*.staging.test.ts`). Its own project, so the
 * other worker tests keep `local`.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // A deployed stage must have an auth secret (local falls back to a fixed one): made up, as the tests sign nothing.
      miniflare: { bindings: { ENVIRONMENT: "staging", BETTER_AUTH_SECRET: "not-a-real-secret-for-the-staging-tests" } }
    })
  ],
  test: {
    testTimeout: 30_000,
    name: "api-worker-staging",
    include: ["test/**/*.staging.test.ts"]
  }
})
