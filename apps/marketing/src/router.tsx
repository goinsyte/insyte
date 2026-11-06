import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

/**
 * The router, created by a FUNCTION rather than at module scope.
 *
 * Start calls `getRouter()` once per request on the server. A router built at module scope would be
 * shared across requests in the same isolate, and a router holds per-navigation state — so on a
 * Worker that means one visitor's pending navigation visible to the next.
 */
export const getRouter = () => {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    // Server-rendered: a route that throws should render something, not a blank document.
    defaultErrorComponent: ({ error }) => <pre>{String(error)}</pre>
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
