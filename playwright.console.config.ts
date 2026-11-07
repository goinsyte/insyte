import { defineConfig, devices } from "@playwright/test"

/**
 * The console's journeys (`e2e/console/`), against the real API and database: what the design reference's journey
 * (`playwright.config.ts`) cannot prove, because the reference signs no one in.
 *
 * Locally it builds the console and serves it with the API beside it on 4300, the origin the API trusts and writes into
 * its mail (`CONSOLE_ORIGIN` in `apps/api/wrangler.jsonc`); the database must be up and migrated. `CONSOLE_URL` points
 * it at a deployed preview instead, through Access with the CI service token. Mail is read from the capture adapter
 * (`/api/__dev/mail`), which exists everywhere but production.
 */
const port = 4300
const external = process.env.CONSOLE_URL
const access = process.env.CF_ACCESS_CLIENT_ID !== undefined && process.env.CF_ACCESS_CLIENT_SECRET !== undefined
  ? {
    "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID,
    "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET
  }
  : undefined

export default defineConfig({
  testDir: "e2e/console",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  expect: { timeout: 15_000 },
  timeout: 90_000,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-console" }]]
    : "list",
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    ...(access === undefined ? {} : { extraHTTPHeaders: access }),
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  ...(external === undefined
    ? {
      webServer: {
        command:
          `bun run --filter @insyte/console build && cd apps/console && bunx vite preview --port ${port} --strictPort`,
        url: `http://localhost:${port}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000
      }
    }
    : {})
})
