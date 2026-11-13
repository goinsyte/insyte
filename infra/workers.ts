/*
 * The source of each bundled Worker as it deploys: its entry and its compatibility. `app.ts` deploys from these, and
 * the startup check (`scripts/startup-check.ts`, through `bundle.ts`) bundles from them, so the check measures the
 * script that ships. A path is relative to this folder, where alchemy runs.
 *
 * ADR-0041: `api` serves HTTP, `jobs` runs the queue consumers, the cron and the Workflows; `public` (step 5) joins
 * them to serve the public API and the MCP server.
 */

export const COMPATIBILITY_DATE = "2026-10-26"

export interface WorkerSource {
  readonly main: string
  readonly compatibility: { readonly date: string; readonly flags: Array<string> }
}

export const WORKERS = {
  api: {
    main: "../apps/api/src/Main.ts",
    // `enable_request_signal`: a client that goes away aborts `request.signal`, and `toWebHandler` interrupts the fiber.
    compatibility: { date: COMPATIBILITY_DATE, flags: ["nodejs_compat", "enable_request_signal"] }
  },
  jobs: {
    main: "../apps/api/src/Jobs.ts",
    compatibility: { date: COMPATIBILITY_DATE, flags: ["nodejs_compat"] }
  }
} as const satisfies Record<string, WorkerSource>

export type WorkerName = keyof typeof WORKERS
