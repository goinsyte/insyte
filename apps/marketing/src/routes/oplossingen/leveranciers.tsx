import { LeveranciersPage } from "@insyte/ui/marketing/pages/oplossingen"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../../links.ts"
import { meta } from "../../meta.ts"

export const Route = createFileRoute("/oplossingen/leveranciers")({
  head: () => ({
    ...meta({
      path: "/oplossingen/leveranciers",
      title: "Insyte voor leveranciers — een eigen portaal voor fulfilment",
      description:
        "Een eigen portaal voor je fulfilmentpartner: alleen de eigen orderregels, accepteren en verzenden met track & trace, problemen melden en afrekeningen per maand."
    })
  }),
  component: () => <LeveranciersPage links={siteLinks} />
})
