/**
 * This host's composition root: the demo data source, and where its two sections live.
 *
 * Imported first by `main.tsx`, so it runs — fixtures and all — before any store or screen module
 * is evaluated. The real `apps/console` has the same file with `VITE_DATA_SOURCE` choosing between
 * this `demo` and its `api` source, and with `configureHrefs({ app: "", site: <marketing origin> })`.
 */
import { installDataSource } from "@insyte/ui/data-source"
import { configureHrefs } from "@insyte/ui/data-source/hrefs"
import { demo } from "./fixtures/index.ts"

installDataSource(demo)
configureHrefs({ app: "/app", site: "/site" })
