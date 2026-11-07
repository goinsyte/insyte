import { RegistryContext } from "@effect/atom-react"
import { createRouter } from "@tanstack/react-router"
import { AtomRegistry, Hydration } from "effect/reactivity"
import { initialAtoms } from "./data/initial.ts"
import { routeTree } from "./routeTree.gen"

/**
 * The router, and with it the atom registry: one per request on the server, one per tab in the browser (11 §4). Never
 * at module scope: a registry shared by every request in the isolate is one visitor's data in another's page.
 */
export const getRouter = () => {
  const registry = AtomRegistry.make({ initialValues: initialAtoms() })
  const router = createRouter({
    routeTree,
    context: { registry },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
    defaultErrorComponent: ({ error }) => <pre>{String(error)}</pre>,
    // The registry's values travel in the document, so the browser starts where the server stopped.
    dehydrate: () => ({ atoms: Hydration.dehydrate(registry) }),
    hydrate: ({ atoms }) => Hydration.hydrate(registry, atoms),
    Wrap: ({ children }) => <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>
  })
  router.serverSsr?.onCleanup(() => registry.dispose())
  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
