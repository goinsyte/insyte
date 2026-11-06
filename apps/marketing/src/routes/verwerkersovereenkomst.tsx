import { VerwerkersovereenkomstPage } from "@insyte/ui/marketing/pages/verwerkersovereenkomst"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../links.ts"
import { meta } from "../meta.ts"

export const Route = createFileRoute("/verwerkersovereenkomst")({
  head: () => ({
    ...meta({
      path: "/verwerkersovereenkomst",
      title: "Verwerkersovereenkomst \u2014 Insyte",
      description:
        "De verwerkersovereenkomst: hoe Insyte als verwerker met de klantgegevens van je winkel omgaat, met de subverwerkers en beveiligingsmaatregelen. Concepttekst."
    })
  }),
  component: () => <VerwerkersovereenkomstPage links={siteLinks} />
})
