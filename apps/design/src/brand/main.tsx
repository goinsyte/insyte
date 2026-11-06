import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { routeTree } from "./routeTree.gen"
// The book's stylesheet: the product's (`app.css`, on `@insyte/tokens`) plus the marketing site's
// construction utilities. A side-effect import because that is the one Vite, Tailwind and knip follow.
import "@insyte/ui/brand/book.css"

/*
 * A router, so every chapter has its own URL (`/brand/kleur`, `/brand/iconen#leeg`) and back and
 * forward work. Scroll restoration is on for back and forward; a chapter link scrolls to the top
 * itself, once the leaving page has animated out (`@insyte/ui/brand/book/shell`).
 */
const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")

if (root === null) throw new Error("index.html has no #root")

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
