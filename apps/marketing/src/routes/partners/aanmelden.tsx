import { PartnerAanmeldenPage } from "@insyte/ui/marketing/pages/forms"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../../links.ts"
import { meta } from "../../meta.ts"

export const Route = createFileRoute("/partners/aanmelden")({
  head: () => ({
    ...meta({
      path: "/partners/aanmelden",
      title: "Partner worden \u2014 aanmelden voor een partnerprogramma | Insyte",
      description:
        "Zo meld je je aan voor het partnerprogramma van een winkel op Insyte: aanmelden, goedkeuring door de winkel, en daarna je eigen links en uitbetalingen in het partnerportaal."
    })
  }),
  component: () => <PartnerAanmeldenPage links={siteLinks} />
})
