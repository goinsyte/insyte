import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { rmSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vite"

/**
 * The reference: the whole product design on one origin, with no backend.
 *
 * `/app/*` is the product (every persona, every design state, sign-in, onboarding, invitations),
 * `/site/*` the marketing site, `/brand/*` the brand book and `/` the front door. One Vite SPA served
 * as Workers static assets (`wrangler.jsonc`), because every section is client state over fixtures
 * and nothing here needs a server. ADR-0026 has the reasoning.
 *
 * Two route trees, because two of the sections are file-routed and each was its own app: the
 * console's route files keep their ids under `src/app/routes`, the brand book's three under
 * `src/brand/routes`. `src/main.tsx` mounts one router per page load, chosen by
 * the path, so the trees never meet at run time; `tsconfig.app.json` and `tsconfig.brand.json`
 * keep them apart at check time too.
 */
export default defineConfig(({ command }) => {
  const productOnly = command === "build" && process.env.REFERENCE_SECTIONS !== "all"
  return {
    /*
     * What a build contains. The dev server always has every section; a build has only the product
     * (`/app`), because every build is a deploy and the deploys are for the product alone for now: the
     * marketing site and the brand book are not to be viewed there. `REFERENCE_SECTIONS=all` builds the
     * whole reference. `src/main.tsx` reads the flag, and the sections it leaves out are not emitted.
     */
    define: {
      "import.meta.env.VITE_PRODUCT_ONLY": JSON.stringify(productOnly)
    },
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routesDirectory: "./src/app/routes",
        generatedRouteTree: "./src/app/routeTree.gen.ts"
      }),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        routesDirectory: "./src/brand/routes",
        generatedRouteTree: "./src/brand/routeTree.gen.ts"
      }),
      tailwindcss(),
      react(),
      /*
       * `public/brand/` is the site's and the brand book's: the mark as a file, which the product draws
       * as a component instead. Copied there by Vite, so removed again when those sections are out.
       */
      {
        name: "product-only-public",
        apply: "build",
        closeBundle() {
          if (productOnly) rmSync(resolve(import.meta.dirname, "dist/brand"), { recursive: true, force: true })
        }
      }
    ],
    /*
     * Carried from the console. Base UI ships one entry per component and Vite discovers a dep the
     * first time a module asks for it, so reaching the session's first accordion re-optimised
     * mid-session and reloaded the page with `Invalid hook call`. Naming the entries up front is the
     * documented fix; `@insyte/ui > …` because Base UI is the component package's dependency.
     */
    optimizeDeps: {
      include: [
        "@insyte/ui > @base-ui-components/react/accordion",
        "@insyte/ui > @base-ui-components/react/alert-dialog",
        "@insyte/ui > @base-ui-components/react/avatar",
        "@insyte/ui > @base-ui-components/react/checkbox",
        "@insyte/ui > @base-ui-components/react/dialog",
        "@insyte/ui > @base-ui-components/react/menu",
        "@insyte/ui > @base-ui-components/react/popover",
        "@insyte/ui > @base-ui-components/react/select",
        "@insyte/ui > @base-ui-components/react/separator",
        "@insyte/ui > @base-ui-components/react/switch",
        "@insyte/ui > @base-ui-components/react/tooltip",
        "@insyte/ui > @base-ui-components/react/use-render"
      ]
    },
    // One port per surface: the reference 4311, marketing 4312.
    server: { port: 4311, strictPort: true }
  }
})
