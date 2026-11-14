import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

/**
 * The Worker with span export on, as a deployed stage has it (`infra/app.ts`), against an OTLP intake the tests fake
 * (`test/*.telemetry.test.ts`): what reaches Sentry from each entry point. Its own project, so the other worker tests
 * export nothing.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          OTEL_TRACES_EXPORTER: "otlp",
          OTEL_SERVICE_NAME: "insyte-test",
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://otlp.test/v1/traces",
          OTEL_BSP_SCHEDULE_DELAY: "3600000"
        }
      }
    })
  ],
  test: {
    testTimeout: 30_000,
    name: "api-worker-telemetry",
    include: ["test/**/*.telemetry.test.ts"]
  }
})
