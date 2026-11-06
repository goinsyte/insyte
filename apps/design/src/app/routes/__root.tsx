import { RootDocument } from "@insyte/ui/app/shell/root-layout"
import { createRootRoute } from "@tanstack/react-router"

/**
 * The root route.
 *
 * Legacy's `__root.tsx` renders the whole HTML document, because it runs on TanStack Start: `<html>`,
 * `<head>` built from `head()`, and `<Scripts />`. Here `index.html` is the document and carries
 * those same tags, so what is left is exactly what legacy puts inside `<body>` — the motion config,
 * the outlet, the toaster and the persona switcher — kept in that order and with its props.
 */
export const Route = createRootRoute({ component: RootDocument })
