/*
 * The source of each bundled Worker as it deploys: its entry and its compatibility. `app.ts` deploys from these, and
 * the startup check (`scripts/startup-check.ts`, through `bundle.ts`) bundles from them, so the check measures the
 * script that ships. A path is relative to this folder, where alchemy runs.
 *
 * ADR-0041: `api` serves HTTP, `jobs` runs the queue consumers, the cron and the Workflows,
 * `public` serves the public API and the MCP server.
 */

import type { WorkerBuildOptions } from "@alchemy.run/cloudflare/Workers/Sources/Rolldown"

export const COMPATIBILITY_DATE = "2026-10-26"

export interface WorkerSource {
  readonly main: string
  readonly compatibility: { readonly date: string; readonly flags: Array<string> }
  readonly build: WorkerBuildOptions
}

/*
 * Every module the entry loads at startup goes in one chunk, next to the chunks that load on demand (ADR-0041 §3).
 * rolldown's default splits a module that both the startup graph and a lazy chunk import into a chunk of its own, so
 * each lazy `import()` can add files workerd must load before the first request: wave 12's lazy imports took the API
 * Worker from 48 such files to 77, and each costs startup CPU of its own beyond its bytes. The lazy chunks stay lazy.
 */
const BUILD: WorkerBuildOptions = {
  output: { codeSplitting: { groups: [{ name: "startup", tags: ["$initial"] }] } }
}

export const WORKERS = {
  api: {
    main: "../apps/api/src/Main.ts",
    build: BUILD,
    // `enable_request_signal`: a client that goes away aborts `request.signal`, and `toWebHandler` interrupts the fiber.
    compatibility: { date: COMPATIBILITY_DATE, flags: ["nodejs_compat", "enable_request_signal"] }
  },
  jobs: {
    main: "../apps/api/src/Jobs.ts",
    build: BUILD,
    compatibility: { date: COMPATIBILITY_DATE, flags: ["nodejs_compat"] }
  },
  public: {
    main: "../apps/api/src/Public.ts",
    build: BUILD,
    compatibility: { date: COMPATIBILITY_DATE, flags: ["nodejs_compat", "enable_request_signal"] }
  }
} as const satisfies Record<string, WorkerSource>

export type WorkerName = keyof typeof WORKERS
