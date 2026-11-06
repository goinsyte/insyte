import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server"
import { app, appUrl, deploymentName, origin, site } from "./site.ts"

/**
 * The Worker's entry: three branches in front of TanStack Start's own handler.
 *
 * Replacing the default entry is the documented extension point — Start's
 * `@tanstack/react-start/server-entry` is exactly `createStartHandler(defaultStreamHandler)` wrapped
 * in an object with a `fetch`, and this adds to it rather than reimplementing it.
 *
 * 1. **The authenticated paths leave for the product.** This site has no session and no account; it
 *    is one public page. `/login`, `/register` and `/onboarding` exist here only so that a bookmark,
 *    an old email or a search result arrives somewhere real instead of at a 404.
 * 2. **`robots.txt`**, which refuses indexing anywhere that is not the production host.
 * 3. **`sitemap.xml`**, generated from `site.routes` so it cannot list a page that does not exist.
 *
 * All three are answered here rather than as routes because none of them needs React, a render or a
 * route match, and a redirect that works even when the client bundle is broken is the point of
 * having one.
 */
const renderWithStart = createStartHandler(defaultStreamHandler)

const productionHost = new URL(origin).host

/**
 * Where each path this site no longer owns now lives.
 *
 * `302`, not `301`: a permanent redirect is cached by browsers for as long as they like, and how
 * these two sites meet is still Phase 1b's decision. The moment it is made, this becomes a 301.
 */
const movedToApp: Record<string, string> = {
  "/login": app.login,
  "/inloggen": app.login,
  "/register": app.onboarding,
  "/registreren": app.onboarding,
  "/onboarding": app.onboarding
}

/**
 * The legacy site's English paths, renamed here to Dutch slugs. Same origin, so the search and the
 * hash travel with the redirect. 302 for the same reason as above.
 */
const renamed: Record<string, string> = {
  "/terms": "/voorwaarden",
  "/dpa": "/verwerkersovereenkomst",
  "/security": "/beveiliging",
  "/pricing": "/prijzen",
  "/faq": "/vragen",
  "/waitlist": "/toegang",
  "/integrations": "/koppelingen",
  "/solutions/operators": "/oplossingen/operators",
  "/product/inbox": "/product/klantenservice",
  "/affiliate/apply": "/partners/aanmelden",
  "/resources/changelog": "/changelog"
}

/** The search the visitor arrived with, preserved — the app's login route reads `?redirect=`. */
const withSearch = (target: string, search: string): string => {
  if (search === "") return appUrl(target)
  const url = new URL(appUrl(target))
  for (const [key, value] of new URLSearchParams(search)) url.searchParams.set(key, value)
  return url.toString()
}

const robots = (host: string): string =>
  host === productionHost && deploymentName === "production"
    ? `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`
    // A preview deployment serving the production site's copy is exactly the duplicate a search
    // engine should never see, and the host is the one thing that tells them apart without a secret.
    : "User-agent: *\nDisallow: /\n"

const sitemap = (): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    site.routes.map((route) => `  <url><loc>${origin}${route}</loc></url>`).join("\n")
  }\n</urlset>\n`

const text = (body: string, contentType: string): Response =>
  new Response(body, { headers: { "content-type": contentType, "cache-control": "public, max-age=3600" } })

export default {
  fetch(request: Request, ...rest: ReadonlyArray<unknown>): Promise<Response> {
    const url = new URL(request.url)
    const moved = movedToApp[url.pathname.replace(/\/+$/, "") || "/"]

    if (moved !== undefined) {
      return Promise.resolve(Response.redirect(withSearch(moved, url.search.replace(/^\?/, "")), 302))
    }

    const rename = renamed[url.pathname.replace(/\/+$/, "") || "/"]
    if (rename !== undefined) return Promise.resolve(Response.redirect(`${url.origin}${rename}${url.search}`, 302))

    if (url.pathname === "/robots.txt") return Promise.resolve(text(robots(url.host), "text/plain; charset=utf-8"))
    if (url.pathname === "/sitemap.xml") return Promise.resolve(text(sitemap(), "application/xml; charset=utf-8"))

    return Promise.resolve(renderWithStart(request, ...(rest as [])))
  }
}
