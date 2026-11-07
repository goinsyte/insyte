import { cloudflare } from "@cloudflare/vite-plugin"
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
export default defineConfig({
  build: { emptyOutDir: true },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      auxiliaryWorkers: [{ configPath: "../api/wrangler.jsonc" }]
    }),
    tanstackStart(),
    viteReact(),
    tailwindcss()
  ],
  // 02 §5.1: console 4300, marketing 4301, api 8787.
  server: { port: 4300, strictPort: true }
})
