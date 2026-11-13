import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { generateKeyPairSync } from "node:crypto"
import { defineConfig } from "vitest/config"

/** A VAPID key pair made for the run (M11 step 13.5): push is available, and no key is ever committed. */
const vapid = (() => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  const jwk = privateKey.export({ format: "jwk" })
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")])
  return {
    VAPID_PUBLIC_KEY: point.toString("base64url"),
    VAPID_PRIVATE_KEY: jwk.d!,
    VAPID_SUBJECT: "mailto:test@insyte.test"
  }
})()

/** The Worker's tests run inside workerd, against `wrangler.jsonc`, through the Worker's own `fetch`. */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Shopify's recorded twin: CI never calls Shopify (integrations.md §1.1).
      // Pages of four lines, so a line item lands in a later page than its order.
      miniflare: {
        bindings: {
          SHOPIFY_ADAPTER: "recorded",
          KLAVIYO_ADAPTER: "recorded",
          PUSH_ADAPTER: "recorded",
          SLACK_ADAPTER: "recorded",
          ...vapid,
          SUPPLIER_API_ADAPTER: "recorded",
          TRACKING_ADAPTER: "recorded",
          FX_ADAPTER: "recorded",
          LABELS_ADAPTER: "recorded",
          WEBHOOK_ADAPTER: "recorded",
          DOCUMENTS_ADAPTER: "html",
          SYNC_PAGE_LINES: "4"
        }
      }
    })
  ],
  test: {
    // A worker test is a journey of real requests through workerd and Postgres (twenty sign-ins, a whole account's
    // history): seconds each when every project runs at once, so 5 s is too tight.
    testTimeout: 30_000,
    name: "api-worker",
    include: ["test/**/*.worker.test.ts"]
  }
})
