// FIRST: the composition root, before any screen can be reached. Imported for what it installs, so unassigned.
// oxlint-disable-next-line import/no-unassigned-import
import "./install.ts"
import { RegistryContext } from "@effect/atom-react"
import { createRouter } from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"
import { AtomRegistry, Hydration } from "effect/reactivity"
import { initialAtoms } from "./data/initial.ts"
import { routeTree } from "./routeTree.gen"

/**
 * The router, and with it the atom registry: one per request on the server, one per tab in the browser (11 §4). Never
 * at module scope: a registry shared by every request in the isolate is one visitor's data in another's page.
 */
/**
 * How long the browser keeps an atom nobody reads. The registry's default drops it on the next task, and with it the
 * value the document carried: a hydration render React sets aside (a lazy route, a yield on a slow device) reads the
 * value, loses it before the retry, and renders without it, React #418. A few seconds covers the gap between that
 * render and its commit. The server's registry lives for one request and keeps the default.
 */
const idleTTL = createIsomorphicFn()
  .server(() => undefined)
  .client(() => 5_000)

export const getRouter = () => {
  const registry = AtomRegistry.make({ initialValues: initialAtoms(), defaultIdleTTL: idleTTL() })
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
