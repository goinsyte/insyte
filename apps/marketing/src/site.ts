/**
 * The site's own facts, in one place.
 *
 * Everything that is a URL, a host or a name lives here rather than in markup, because the landing
 * page is not the only thing that needs them: the canonical tag, the sitemap, `robots.txt` and every
 * call to action read the same constants. The legacy site hardcoded its pricing in a component while
 * a separate package noted that Stripe was the source of truth for what is actually charged.
 */

/**
 * The two origins per deployment, decided at build time so the server render and the hydrated
 * client agree: `vite dev` links to the product demo in the design reference (`apps/design` on
 * port 4311, under `/app` — the real console is not built yet, ADR-0026), `vite build --mode
 * staging` to staging, any other build to production. `VITE_SITE_ORIGIN` / `VITE_APP_ORIGIN`
 * override either (CI sets them for a pull request's preview). Public values, not secrets.
 *
 * The staging hostnames are proposed, not live: staging DNS is not set up yet (docs/backend/ci-cd.md
 * names the environment, not its hosts). Change them here when it is.
 */
const ORIGINS = {
  development: { site: "http://localhost:4312", app: "http://localhost:4311/app" },
  staging: { site: "https://staging.goinsyte.com", app: "https://app.staging.goinsyte.com" },
  production: { site: "https://goinsyte.com", app: "https://app.goinsyte.com" }
} as const

function deployment(): keyof typeof ORIGINS {
  if (import.meta.env.DEV) return "development"
  return import.meta.env.MODE === "staging" ? "staging" : "production"
}

/** Which deployment this build is for. Only production may be indexed. */
export const deploymentName = deployment()

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}

/**
 * Where this site is meant to live.
 *
 * `goinsyte.com` today serves the LEGACY marketing site, which this repo does not touch. This is the
 * origin the new site is written for; whether it arrives at the apex or at `www`, and how the two
 * sites meet, is Phase 1b's decision and is changed here when it is made.
 */
export const origin = trimSlash(import.meta.env.VITE_SITE_ORIGIN ?? ORIGINS[deploymentName].site)

/**
 * The product, which is a different origin and always has been — the transactional emails have
 * linked to `app.goinsyte.com/settings/billing` all along.
 *
 * The marketing site has no session, no auth and no account of its own, so every authenticated path
 * is a link out rather than a route. `src/server.ts` redirects the legacy paths to the same place,
 * so a bookmark or a search result for `/login` still arrives somewhere real.
 */
export const app = {
  /* Per deployment, like `origin` above; `VITE_APP_ORIGIN` points a PR preview at its console Worker. */
  origin: trimSlash(import.meta.env.VITE_APP_ORIGIN ?? ORIGINS[deploymentName].app),
  /** Existing operators. Carries `?redirect=` through, which the app's own login route reads. */
  login: "/login",
  /**
   * New accounts. The app's `/register` exists only to redirect here, so linking to `/onboarding`
   * directly saves a hop — and `?persona=admin` seeds the right branch of a three-persona flow for
   * the one persona this site is written for.
   */
  onboarding: "/onboarding?persona=admin"
} as const

/** An absolute URL into the product. */
export const appUrl = (path: string): string => `${app.origin}${path}`

export const site = {
  name: "Insyte",
  /** Used for `lang`, `og:locale` and `Intl` formatting. A second locale is a second copy file. */
  locale: "nl",
  ogLocale: "nl_NL",
  /**
   * Every page this site serves, for the sitemap and for deciding which links stay local.
   *
   * Typed as a plain string array rather than the literal tuple `as const` would infer: the literal
   * type makes `routes.includes(somePath)` a compile error, which reads as a safety and is the
   * opposite — the whole point is to ask about paths that may not be in the list.
   */
  routes: [
    "/",
    "/vragen",
    "/prijzen",
    "/beveiliging",
    "/privacy",
    "/voorwaarden",
    "/verwerkersovereenkomst",
    "/oplossingen/operators",
    "/oplossingen/leveranciers",
    "/oplossingen/partners",
    "/product/bestellingen",
    "/product/klantenservice",
    "/product/chargebacks",
    "/product/automatiseringen",
    "/product/insyte-ai",
    "/koppelingen",
    "/changelog",
    "/roadmap",
    "/toegang",
    "/partners/aanmelden"
  ] as ReadonlyArray<string>
} as const
