/**
 * Where a host's Turnstile site key comes from (M2.2), set once at its composition root, like the hrefs. The console
 * asks its API; the design reference sets nothing, and `auth/human-check.tsx` then renders nothing. Apart from the
 * component so a composition root can set it without importing a component.
 */
let siteKeyOf: (() => Promise<string | null>) | undefined

export function configureHumanCheck(siteKey: () => Promise<string | null>): void {
  siteKeyOf = siteKey
}

/** The configured source, or `undefined` where this host checks for no humans. */
export const humanCheckSiteKey = (): (() => Promise<string | null>) | undefined => siteKeyOf
