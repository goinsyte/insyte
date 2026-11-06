import { PrijzenPage } from "@insyte/ui/marketing/pages/prijzen"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../links.ts"
import { meta } from "../meta.ts"

export const Route = createFileRoute("/prijzen")({
  head: () => ({
    ...meta({
      path: "/prijzen",
      title: "Prijzen — Insyte",
      description:
        "Drie abonnementen naar winkels, plekken en bestellingen per maand, met een volledige vergelijking per onderdeel. De prijzen zijn indicatief zolang Insyte in private bèta is."
    })
  }),
  component: () => <PrijzenPage links={siteLinks} />
})
