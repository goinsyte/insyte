import { Landing } from "@insyte/ui/marketing/landing"
import { createFileRoute } from "@tanstack/react-router"
import { pageMeta } from "../copy/index.ts"
import { siteLinks } from "../links.ts"
import { meta } from "../meta.ts"

/**
 * The landing page, and in Phase 1 the only page.
 *
 * The page itself is `@insyte/ui/marketing`. The route owns the head tags and the destinations — the
 * two things that are genuinely this deployment's rather than the page's.
 */
export const Route = createFileRoute("/")({
  head: () => ({ ...meta({ path: "/", title: pageMeta.title, description: pageMeta.description }) }),
  component: Page
})

function Page() {
  return <Landing links={siteLinks} />
}
