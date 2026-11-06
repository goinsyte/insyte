import type { MarketingLinks } from "@insyte/ui/marketing/links"

/**
 * The marketing site's destinations, inside the reference.
 *
 * `apps/marketing/src/links.ts` builds the same object from its deployment's origins and sends the
 * product links to the real console. Here everything is one origin: a page of the site is under
 * `/site`, and a product link is the product demo under `/app`.
 */
const page = (path: string): string => {
  const [bare = path, hash] = path.split("#")
  const base = `/site${bare === "/" ? "" : bare}`
  return hash === undefined ? base : `${base}#${hash}`
}

export const referenceLinks: MarketingLinks = {
  home: "/site",
  login: "/app/login",
  onboarding: "/app/onboarding?persona=admin",
  inApp: (path) => `/app/login?redirect=${encodeURIComponent(path)}`,
  page
}
