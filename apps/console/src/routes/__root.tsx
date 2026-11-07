import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import type { AtomRegistry } from "effect/reactivity"
import type { ReactNode } from "react"
import appCss from "../styles/app.css?url"

export interface RouterContext {
  readonly registry: AtomRegistry.AtomRegistry
}

/** The document. `<HeadContent />` and `<Scripts />` are what make the server's HTML hydrate. */
export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Insyte" },
      { name: "robots", content: "noindex" }
    ],
    links: [{ rel: "stylesheet", href: appCss }]
  }),
  shellComponent: RootDocument,
  component: Outlet
})

function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
