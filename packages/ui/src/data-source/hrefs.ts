/**
 * Where a raw URL points, for the few places a screen leaves the router: a full-page
 * `window.location.assign`, an OAuth `callbackURL`, a plain `<a href>` to the marketing site.
 *
 * Router links need none of this — the router's `basepath` already carries them. These do, because
 * the same screens are served at two different places: `apps/design` mounts the product under
 * `/app` and the marketing site under `/site` on one origin, and the real `apps/console` serves the
 * product at its root with the site on another origin. The host says which, once, at its
 * composition root, next to `installDataSource`. Unconfigured, both are the product's root, which
 * is what the console always assumed.
 */
let app = ""
let site = ""

export function configureHrefs(next: { readonly app: string; readonly site: string }): void {
  app = next.app.replace(/\/$/, "")
  site = next.site.replace(/\/$/, "")
}

/** A path in the product, as a URL the browser can be sent to. */
export const appHref = (path: string): string => `${app}${path}`

/** A page of the marketing site. */
export const siteHref = (path: string): string => `${site}${path}`
