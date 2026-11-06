import { ToegangPage } from "@insyte/ui/marketing/pages/forms"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../links.ts"
import { meta } from "../meta.ts"

export const Route = createFileRoute("/toegang")({
  head: () => ({
    ...meta({
      path: "/toegang",
      title: "Toegang aanvragen \u2014 Insyte",
      description:
        "Insyte is in private bèta en werkt op uitnodiging. Vraag toegang aan met Google of met je werkmail en vertel kort over je winkels. Geen creditcard nodig."
    })
  }),
  component: () => <ToegangPage links={siteLinks} />
})
