// The app proper, loaded by `main.tsx` once the data source is installed.
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { routeTree } from "./routeTree.gen"
// The stylesheet, and through it Tailwind, the legacy design system and the two self-hosted faces.
import "@insyte/ui/app/app.css"

/*
 * Mounted at `/app`. The route files are the console's, unchanged, so every `<Link to="/orders">` in
 * the screens still means `/orders`; the basepath is what puts it at `/app/orders` on this origin.
 */
const router = createRouter({ routeTree, defaultPreload: "intent", basepath: "/app" })

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
