import { defineConfig } from "vitest/config"

/**
 * Projects split by what a test needs, not by where it lives.
 *
 * Phase 1 is the design layer, so nothing here needs a database, a binding or a network: the token
 * tests are arithmetic over colour values and the component tests render into a DOM. Both are fast
 * enough to run on every save, which is the property worth protecting as projects are added.
 */
export default defineConfig({
  test: {
    projects: [
      // The API Worker, inside workerd. Its own config: the Cloudflare plugin belongs to that project only.
      "apps/api/vitest.config.ts",
      {
        // The shared values: ids, money, the permission catalogue. Pure, so `node`.
        test: {
          name: "domain",
          include: ["packages/domain/test/**/*.test.ts"],
          environment: "node"
        }
      },
      {
        /*
         * The design system's values. Pure functions over colour, so `node` is enough.
         *
         * The gamut assertion lives here and is the one test that gates the rest of the phase: a token
         * outside sRGB renders as something the browser clipped, which means the colour on screen was
         * never the colour that was written.
         */
        test: {
          name: "tokens",
          include: ["packages/tokens/test/**/*.test.ts"],
          environment: "node"
        }
      },
      {
        /*
         * The component package. Phase 1's tests here read the sources rather than rendering them:
         * the rules worth gating — one radius ladder, no literal colour, monospace for figures only —
         * are properties of the text, and checking them needs no DOM and so no DOM dependency. A
         * render harness arrives with the first primitive that has behaviour to assert.
         */
        test: {
          name: "ui",
          include: ["packages/ui/test/**/*.test.ts"],
          environment: "node"
        }
      }
    ]
  }
})
