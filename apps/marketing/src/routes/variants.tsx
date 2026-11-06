import { VariantsPage } from "@insyte/ui/marketing/pages/variants/lab"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../links.ts"
import { meta } from "../meta.ts"

/** The hero-background lab: not linked, not in the sitemap (`site.routes`), and kept out of search. */
export const Route = createFileRoute("/variants")({
  head: () => {
    const m = meta({
      path: "/variants",
      title: "Achtergronden — lab | Insyte",
      description: "Experimenten met achtergronden voor de hero, om naast elkaar te vergelijken."
    })
    return { ...m, meta: [...m.meta, { name: "robots", content: "noindex, nofollow" }] }
  },
  component: () => <VariantsPage links={siteLinks} />
})
