import { createContext, type ReactNode, useContext } from "react"

/**
 * Where the landing page's links go.
 *
 * The product lives at another origin and this site serves one route, so every destination is
 * computed by the deployment rather than written into the markup. Through context because the nav,
 * every chapter's arrow links and the footer all need it.
 */
export type MarketingLinks = {
  /** This site's own landing page. */
  readonly home: string
  /** The product's sign-in, at the app origin. */
  readonly login: string
  /**
   * Where an operator asks for access. Insyte is private beta and invite only, so this is the one
   * primary action on the page; it is never labelled as a self-serve signup.
   */
  readonly onboarding: string
  /** A screen of the product, through sign-in: the app's login route carries `?redirect=` through. */
  readonly inApp: (path: string) => string
  /** A marketing route this site does not serve yet, which resolves to the site that still does. */
  readonly page: (path: string) => string
}

const MarketingLinksContext = createContext<MarketingLinks | null>(null)

export function MarketingLinksProvider(
  { children, links }: { readonly links: MarketingLinks; readonly children: ReactNode }
) {
  return <MarketingLinksContext value={links}>{children}</MarketingLinksContext>
}

export function useMarketingLinks(): MarketingLinks {
  const links = useContext(MarketingLinksContext)

  if (links === null) throw new Error("the marketing page must be rendered inside MarketingLinksProvider")

  return links
}
