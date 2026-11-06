import { VoorwaardenPage } from "@insyte/ui/marketing/pages/voorwaarden"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../links.ts"
import { meta } from "../meta.ts"

export const Route = createFileRoute("/voorwaarden")({
  head: () => ({
    ...meta({
      path: "/voorwaarden",
      title: "Voorwaarden \u2014 Insyte",
      description:
        "De voorwaarden voor het gebruik van Insyte: account, dienst, gegevens, AI-functies, tarieven en aansprakelijkheid. Concepttekst, juridisch nog te controleren."
    })
  }),
  component: () => <VoorwaardenPage links={siteLinks} />
})
