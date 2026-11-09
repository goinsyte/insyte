import { Toaster } from "@insyte/ui/components/sonner"
import { ClientOnly, createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import type { AtomRegistry } from "effect/reactivity"
import { type ReactNode, useEffect } from "react"
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
        {
          /* Where the screens say what they did, with their undo (`undoable`). In the browser only: it reads the
            system's colour scheme there, which the server cannot know. */
        }
        <ClientOnly>
          <Toaster richColors position="bottom-center" />
        </ClientOnly>
        <Hydrated />
        <Scripts />
      </body>
    </html>
  )
}

/**
 * `<html data-hydrated>` once the server's HTML is React's: until then a click lands on markup nothing listens to. The
 * console's journeys wait for it before they press anything.
 */
function Hydrated() {
  useEffect(() => {
    document.documentElement.dataset["hydrated"] = "true"
  }, [])
  return null
}
