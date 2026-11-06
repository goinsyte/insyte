/**
 * NOT PORTED — written for this repo. See ADR-0004, and ADR-0005 for why the check is gone.
 *
 * Legacy reads `@insyte/env/web`, a `@t3-oss/env-core` schema shared with the Elysia server, which
 * validates four VITE_ variables at startup. This repo has no server and no API, so three of the
 * four name an origin nothing is served from. Rather than port a validator for values that cannot
 * be set correctly, this is the same shape, read from Vite, with the one flag the ported layout
 * routes actually branch on.
 *
 * It keeps the legacy module's export surface exactly, so the three routes that read it are
 * unedited. When the API lands, this file is replaced by the real package and they still are.
 */
const vite = import.meta.env as Record<string, string | undefined>

export const env = {
  /** The layout routes redirect to `/` when this is off. Default on, as legacy's schema defaults. */
  VITE_DASHBOARD_ENABLED: vite["VITE_DASHBOARD_ENABLED"] !== "false",
  VITE_SERVER_URL: vite["VITE_SERVER_URL"],
  VITE_API_URL: vite["VITE_API_URL"],
  VITE_WS_URL: vite["VITE_WS_URL"]
} as const
