import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { site } from "../site.ts"
import appCss from "../styles/app.css?url"

/**
 * The root route, which under SSR owns the whole HTML document.
 *
 * There is no `index.html`: the server renders the document, so `<html>`, `<head>` and `<body>` live
 * here. `<HeadContent />` is where a route's `head()` lands and `<Scripts />` is where the client
 * bundle goes — omit either and the page renders on the server and never hydrates, which reads as
 * "React is broken" rather than "a tag is missing".
 */
export const Route = createRootRoute({
  head: () => ({
    links: [
      { rel: "stylesheet", href: appCss },
      /*
       * General Sans, from Fontshare: its CSS contains `@font-face` blocks, which must arrive after
       * every `@import`, so it cannot be imported from the stylesheet. `display=swap` means the
       * headline paints at once in Inter (bundled) and swaps; the request is still render-blocking
       * CSS from a third party, which is a real cost and is why the licence question — whether ITF's
       * Free Font License permits self-hosting — is still open.
       */
      { rel: "preconnect", href: "https://api.fontshare.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap"
      }
      // No favicon link yet: the mark is an open decision — the legacy repo ships two — and a
      // `<link rel="icon">` to a file that does not exist is a 404 on every page load.
    ]
  }),
  shellComponent: RootDocument,
  component: Outlet
})

function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    // `lang` from the content model: this site is Dutch, and a screen reader picks its voice from it.
    // `light`: the page is drawn in the daylight map whatever the system theme says.
    <html lang={site.locale} className="light">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        {/* Visually hidden until focused. `#main` is the hero's headline block. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-paper focus:px-4 focus:py-2 focus:ring-2 focus:ring-arc"
        >
          Naar de inhoud
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
