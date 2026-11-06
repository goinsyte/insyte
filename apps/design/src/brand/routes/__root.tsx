import { createRootRoute, Outlet } from "@tanstack/react-router"

/**
 * The root route, and nothing else.
 *
 * The legacy `__root.tsx` owns the whole product — auth, query client, devtools, the document head
 * for fourteen public routes — and none of that is what the brand book needs. Here the document is
 * `index.html` and this file only opens the outlet the chapters render into.
 */
export const Route = createRootRoute({ component: Outlet })
