import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

/**
 * The landing page, as a TanStack Start app on a Cloudflare Worker.
 *
 * A Worker rather than a static build, for one reason that is worth the machinery: the paths this
 * site no longer owns — `/login`, `/register`, `/onboarding` — have to redirect to the product
 * before any HTML is sent. Static hosting can do that with a platform config file; a Worker does it
 * in the code that already exists, next to the constants the links are built from.
 *
 * Plugin order is Cloudflare's own framework guide: `cloudflare` first, declaring the SSR
 * environment it owns, then `tanstackStart`, then React. `viteEnvironment: { name: "ssr" }` is what
 * tells the plugin which Vite environment runs in workerd — without it the SSR pass runs in Node.
 */
export default defineConfig({
  build: { emptyOutDir: true },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    viteReact(),
    tailwindcss()
  ],
  // One port per surface: brand 4310, design 4311, marketing 4312.
  server: { port: 4312, strictPort: true }
})
