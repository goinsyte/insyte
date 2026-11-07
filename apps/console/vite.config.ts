import { cloudflare } from "@cloudflare/vite-plugin"
import { sentryVitePlugin } from "@sentry/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * The console, as TanStack Start on a Cloudflare Worker (ADR-0033, 11 §3).
 *
 * The plugin order is Cloudflare's framework guide, as in `apps/marketing`: `cloudflare` first, owning the SSR
 * environment, then `tanstackStart`, then React. `auxiliaryWorkers` runs the API Worker in the same `vite dev`, so the
 * `API` service binding answers locally exactly as it will deployed.
 */
/**
 * Source maps go to Sentry, never to the browser: built as `hidden` (no `sourceMappingURL` comment), uploaded for this
 * release, then deleted. Only when a deploy provides `SENTRY_AUTH_TOKEN`; a local build makes no maps at all.
 */
const sentryAuthToken = process.env["SENTRY_AUTH_TOKEN"]
const sourceMaps = sentryAuthToken === undefined || sentryAuthToken === ""
  ? []
  : [
    sentryVitePlugin({
      org: "insyte-c4",
      project: "insyte-console",
      url: "https://de.sentry.io/",
      authToken: sentryAuthToken,
      release: { name: process.env["VITE_VERSION"] ?? "dev" },
      sourcemaps: {
        assets: ["./dist/client/**"],
        filesToDeleteAfterUpload: ["./dist/client/**/*.map"]
      },
      telemetry: false
    })
  ]

export default defineConfig({
  build: { emptyOutDir: true, sourcemap: sourceMaps.length > 0 ? "hidden" : false },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      auxiliaryWorkers: [{ configPath: "../api/wrangler.jsonc" }]
    }),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    ...sourceMaps
  ],
  // 02 §5.1: console 4300, marketing 4301, api 8787.
  server: { port: 4300, strictPort: true }
})
