import type { MarketingLinks } from "@insyte/ui/marketing/links"
import { app, appUrl, origin, site } from "./site.ts"

/**
 * Where every link on every page goes, built once from `site.ts` so no page hardcodes an origin.
 *
 * `page`: a route this site serves stays here; anything else resolves against this deployment's
 * origin. `site.routes` is the list, so a page added there stops leaving on the same commit.
 */
export const siteLinks: MarketingLinks = {
  home: "/",
  login: appUrl(app.login),
  onboarding: appUrl(app.onboarding),
  // A screen of the product, through sign-in, which carries `?redirect=` through.
  inApp: (path) => appUrl(`${app.login}?redirect=${encodeURIComponent(path)}`),
  page: (path) => {
    const [bare = path, hash] = path.split("#")
    const local = site.routes.includes(bare)
    const base = local ? bare : `${origin}${bare}`
    return hash === undefined ? base : `${base}#${hash}`
  }
}
