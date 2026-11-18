/*
 * The console's security headers (08 §6, M18 "CSP without `unsafe-inline`"), set by the console Worker on every page.
 *
 * Scripts run only from this origin, from Turnstile's, or inline with this response's nonce: TanStack Start stamps it
 * on its hydration and route scripts when the router knows it (`ssr.nonce`, `router.tsx`), and the browser's router
 * reads it back from `<meta property="csp-nonce">` for the scripts it adds later. A nonce in `script-src` makes the
 * browser ignore `'unsafe-inline'` there, so none is listed. Styles keep `'unsafe-inline'`: the server renders
 * `style` attributes and the toasts inject a `<style>` element at run time, and a style cannot run code.
 *
 * Under `vite dev` there is no nonce: Vite's own inline preamble carries none, so development keeps `'unsafe-inline'`.
 */

/** A fresh nonce per response: 128 random bits, base64. */
export const newNonce = (): string => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))

export const securityHeaders = (
  { nonce, environment }: { readonly nonce: string | undefined; readonly environment: string }
): Record<string, string> => ({
  "content-security-policy": [
    "default-src 'self'",
    // Cloudflare Turnstile: its script, its iframe and its calls (M2.2).
    `script-src 'self' ${
      nonce === undefined ? "'unsafe-inline'" : `'nonce-${nonce}'`
    } https://challenges.cloudflare.com`,
    "frame-src https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    // Product photographs from Shopify's CDN (M6.4); the recorded test store's from Unsplash, outside production.
    `img-src 'self' data: blob: https://cdn.shopify.com${
      environment === "production" ? "" : " https://images.unsplash.com"
    }`,
    "font-src 'self' data:",
    // Sentry's EU ingest, for browser errors and spans (17 §4).
    "connect-src 'self' https://*.ingest.de.sentry.io https://challenges.cloudflare.com",
    // The service worker (offline page, push) and the workers a library may start, from this origin only.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join("; "),
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
})
