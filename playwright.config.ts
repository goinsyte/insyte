import { defineConfig, devices } from "@playwright/test"

/**
 * The journey test: the built design reference, clicked through the way a person would — sign in,
 * register as each persona, accept each kind of invitation, switch personas in the dashboard.
 *
 * It runs against the PRODUCTION bundle, not the dev server, on purpose. Dev serves every module
 * on its own and so hides chunk-order bugs: the first time this ran, every page under `/app` threw
 * in the build and rendered fine in dev. `vite preview` serves `dist/` with the same SPA fallback
 * the Worker's `not_found_handling` gives it. `BASE_URL` points it at a deployed copy instead.
 */
const port = 4399
const external = process.env.BASE_URL

export default defineConfig({
  testDir: "e2e",
  // The console's journeys run against a real API: `playwright.console.config.ts`.
  testIgnore: "console/**",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A dashboard's first lazy chunk can take seconds when every worker is loading one at once; the
  // assertions are about where a path lands, not how fast.
  expect: { timeout: 15_000 },
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } }
  ],
  ...(external === undefined
    ? {
      webServer: {
        command:
          `bun run --filter @insyte/design build && cd apps/design && bunx vite preview --port ${port} --strictPort`,
        url: `http://localhost:${port}/app/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000
      }
    }
    : {})
})
